'use strict';

const express = require('express');
const prisma = require('../lib/prisma');
const { NotFoundError, ConflictError } = require('../lib/errors');
const { recordAudit, clientIp } = require('../lib/audit');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate, authorize } = require('../middleware/authenticate');
const { parseListQuery, paginated } = require('../utils/pagination');
const { applyMovements } = require('../services/stock.service');
const { allocateNumber } = require('../services/counter.service');
const { checkThresholdsAsync } = require('../services/alert.service');
const { resolveReceiptLine } = require('../services/packaging.service');
const {
  createReceiptSchema,
  updateReceiptSchema,
  cancelDocSchema,
  idParamSchema,
} = require('../validators/stock.validator');

const router = express.Router();
router.use(authenticate);

const DOC_INCLUDE = {
  supplier: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  validatedBy: { select: { id: true, name: true } },
  lines: {
    include: {
      product: {
        select: {
          id: true, reference: true, designation: true, designationEn: true,
          unit: true, unitsPerCarton: true, sellPrice: true, cartonSellPrice: true,
        },
      },
    },
  },
};

// GET /api/receipts
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = parseListQuery(req.query, {
      sortable: ['receiptDate', 'number', 'createdAt'],
      defaultSort: 'receiptDate',
    });
    const { status, supplierId, from, to } = req.query;

    const where = {
      ...(status ? { status } : {}),
      ...(supplierId ? { supplierId } : {}),
      ...(from || to
        ? { receiptDate: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
        : {}),
      ...(q.search ? { number: { contains: q.search, mode: 'insensitive' } } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.goodsReceipt.findMany({
        where,
        skip: q.skip,
        take: q.take,
        orderBy: q.orderBy,
        include: {
          supplier: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true } },
          _count: { select: { lines: true } },
        },
      }),
      prisma.goodsReceipt.count({ where }),
    ]);

    res.json(paginated(items, total, q));
  })
);

// GET /api/receipts/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const receipt = await prisma.goodsReceipt.findUnique({ where: { id }, include: DOC_INCLUDE });
    if (!receipt) throw new NotFoundError('GoodsReceipt', id);
    res.json(receipt);
  })
);

// POST /api/receipts - always created as DRAFT; stock is untouched until validation (BR-1).
router.post(
  '/',
  authorize('ADMIN', 'MAGASINIER'),
  asyncHandler(async (req, res) => {
    const { lines, ...data } = createReceiptSchema.parse(req.body);

    // Receiving 3 cartons of 12 must add 36 bottles, so the conversion happens
    // before anything is stored - the same resolution the issue side uses.
    const products = await prisma.product.findMany({
      where: { id: { in: [...new Set(lines.map((l) => l.productId))] } },
    });
    const productById = new Map(products.map((p) => [p.id, p]));

    const resolvedLines = lines.map((line) => {
      const product = productById.get(line.productId);
      if (!product) throw new NotFoundError('Product', line.productId);
      return resolveReceiptLine(product, line);
    });

    const receipt = await prisma.$transaction(async (tx) => {
      const number = await allocateNumber(tx, 'RECEIPT');
      return tx.goodsReceipt.create({
        data: {
          ...data,
          number,
          status: 'DRAFT',
          createdById: req.user.id,
          lines: { create: resolvedLines },
        },
        include: DOC_INCLUDE,
      });
    });

    await recordAudit({
      userId: req.user.id,
      action: 'CREATE_RECEIPT',
      entity: 'GoodsReceipt',
      entityId: receipt.id,
      after: { number: receipt.number, lines: lines.length },
      ipAddress: clientIp(req),
    });

    res.status(201).json(receipt);
  })
);

// PATCH /api/receipts/:id - drafts only.
router.patch(
  '/:id',
  authorize('ADMIN', 'MAGASINIER'),
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const { lines, ...data } = updateReceiptSchema.parse(req.body);

    const existing = await prisma.goodsReceipt.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('GoodsReceipt', id);
    if (existing.status !== 'DRAFT') throw new ConflictError('DOCUMENT_NOT_DRAFT');

    // Edited lines are re-resolved: an unchanged `packaging` still needs its
    // baseQuantity recomputed against the product's current factor.
    let resolvedEditLines = null;
    if (lines) {
      const editProducts = await prisma.product.findMany({
        where: { id: { in: [...new Set(lines.map((l) => l.productId))] } },
      });
      const editById = new Map(editProducts.map((p) => [p.id, p]));
      resolvedEditLines = lines.map((line) => {
        const product = editById.get(line.productId);
        if (!product) throw new NotFoundError('Product', line.productId);
        return resolveReceiptLine(product, line);
      });
    }

    const receipt = await prisma.$transaction(async (tx) => {
      if (resolvedEditLines) {
        await tx.goodsReceiptLine.deleteMany({ where: { receiptId: id } });
        await tx.goodsReceiptLine.createMany({
          data: resolvedEditLines.map((line) => ({ ...line, receiptId: id })),
        });
      }
      return tx.goodsReceipt.update({ where: { id }, data, include: DOC_INCLUDE });
    });

    res.json(receipt);
  })
);

// POST /api/receipts/:id/validate - the only place a receipt touches stock.
router.post(
  '/:id/validate',
  authorize('ADMIN', 'MAGASINIER'),
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);

    const receipt = await prisma.$transaction(async (tx) => {
      const doc = await tx.goodsReceipt.findUnique({ where: { id }, include: { lines: true } });
      if (!doc) throw new NotFoundError('GoodsReceipt', id);
      if (doc.status === 'VALIDATED') throw new ConflictError('DOCUMENT_ALREADY_VALIDATED');
      if (doc.status === 'CANCELLED') throw new ConflictError('DOCUMENT_CANCELLED');
      if (doc.lines.length === 0) throw new ConflictError('EMPTY_DOCUMENT');

      await applyMovements(
        tx,
        doc.lines.map((line) => ({
          type: 'IN',
          productId: line.productId,
          quantity: line.baseQuantity,
          unitCost: line.unitPrice,
          lotNumber: line.lotNumber,
          reason: doc.reason,
          refType: 'GoodsReceipt',
          refId: doc.id,
          userId: req.user.id,
        }))
      );

      return tx.goodsReceipt.update({
        where: { id },
        data: { status: 'VALIDATED', validatedAt: new Date(), validatedById: req.user.id },
        include: DOC_INCLUDE,
      });
    });

    // BR-8: post-commit, so alerting never extends the movement's locks.
    checkThresholdsAsync(
      receipt.lines.map((line) => line.productId)
    );

    await recordAudit({
      userId: req.user.id,
      action: 'VALIDATE_RECEIPT',
      entity: 'GoodsReceipt',
      entityId: id,
      after: { number: receipt.number, lines: receipt.lines.length },
      ipAddress: clientIp(req),
    });

    res.json(receipt);
  })
);

// POST /api/receipts/:id/cancel - posts exact compensating movements (BR-9).
router.post(
  '/:id/cancel',
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const { reason } = cancelDocSchema.parse(req.body);

    const receipt = await prisma.$transaction(async (tx) => {
      const doc = await tx.goodsReceipt.findUnique({ where: { id }, include: { lines: true } });
      if (!doc) throw new NotFoundError('GoodsReceipt', id);
      if (doc.status === 'CANCELLED') throw new ConflictError('DOCUMENT_CANCELLED');

      // A DRAFT never moved stock, so cancelling it is a pure status change.
      if (doc.status === 'VALIDATED') {
        // Reversing an entry removes stock. If it has already been issued
        // onward the reversal is refused rather than driving the level negative.
        await applyMovements(
          tx,
          doc.lines.map((line) => ({
            type: 'OUT',
            productId: line.productId,
              quantity: line.baseQuantity,
            reason: `Annulation ${doc.number}: ${reason}`,
            refType: 'GoodsReceipt',
            refId: doc.id,
            userId: req.user.id,
          }))
        );
      }

      return tx.goodsReceipt.update({
        where: { id },
        data: { status: 'CANCELLED', notes: reason },
        include: DOC_INCLUDE,
      });
    });

    checkThresholdsAsync(
      receipt.lines.map((line) => line.productId)
    );

    await recordAudit({
      userId: req.user.id,
      action: 'CANCEL_RECEIPT',
      entity: 'GoodsReceipt',
      entityId: id,
      after: { number: receipt.number, reason },
      ipAddress: clientIp(req),
    });

    res.json(receipt);
  })
);

module.exports = router;
