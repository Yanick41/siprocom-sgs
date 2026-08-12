'use strict';

const express = require('express');
const prisma = require('../lib/prisma');
const { NotFoundError, ConflictError, ForbiddenError } = require('../lib/errors');
const { recordAudit, clientIp } = require('../lib/audit');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate, authorize } = require('../middleware/authenticate');
const { parseListQuery, paginated } = require('../utils/pagination');
const { applyMovements } = require('../services/stock.service');
const { allocateNumber } = require('../services/counter.service');
const { checkThresholdsAsync } = require('../services/alert.service');
const { resolveIssueLine } = require('../services/packaging.service');

/** Both warehouses are affected on a transfer, so both must be re-checked. */
const affectedPairs = (doc) =>
  doc.lines.flatMap((line) => [
    { productId: line.productId, warehouseId: doc.warehouseId },
    ...(doc.destWarehouseId
      ? [{ productId: line.productId, warehouseId: doc.destWarehouseId }]
      : []),
  ]);
const {
  createIssueSchema,
  updateIssueSchema,
  validateDocSchema,
  cancelDocSchema,
  idParamSchema,
} = require('../validators/stock.validator');

const router = express.Router();
router.use(authenticate);

const DOC_INCLUDE = {
  warehouse: { select: { id: true, code: true, name: true } },
  destWarehouse: { select: { id: true, code: true, name: true } },
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

// GET /api/issues
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = parseListQuery(req.query, {
      sortable: ['issueDate', 'number', 'createdAt'],
      defaultSort: 'issueDate',
    });
    const { status, warehouseId, reason, from, to } = req.query;

    const where = {
      ...(status ? { status } : {}),
      ...(warehouseId ? { warehouseId } : {}),
      ...(reason ? { reason } : {}),
      ...(from || to
        ? { issueDate: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
        : {}),
      ...(q.search ? { number: { contains: q.search, mode: 'insensitive' } } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.goodsIssue.findMany({
        where,
        skip: q.skip,
        take: q.take,
        orderBy: q.orderBy,
        include: {
          warehouse: { select: { id: true, code: true, name: true } },
          destWarehouse: { select: { id: true, code: true, name: true } },
          createdBy: { select: { id: true, name: true } },
          _count: { select: { lines: true } },
        },
      }),
      prisma.goodsIssue.count({ where }),
    ]);

    res.json(paginated(items, total, q));
  })
);

/**
 * Customers seen on past issues: GET /api/issues/customers
 *
 * Derived from the documents themselves rather than kept in a Customer table.
 * A shop sells to walk-ins as often as to regulars, and a table would mean a
 * record for every one of them — while the documents already hold the answer.
 *
 * Most recent details win: a customer who moved should not be offered the old
 * address. Declared before /:id so "customers" is not read as an id.
 */
router.get(
  '/customers',
  asyncHandler(async (req, res) => {
    const rows = await prisma.$queryRaw`
      SELECT DISTINCT ON (lower(recipient))
             recipient,
             "recipientPhone" AS phone,
             "recipientAddress" AS address
      FROM goods_issues
      WHERE recipient IS NOT NULL AND btrim(recipient) <> ''
      ORDER BY lower(recipient), "issueDate" DESC
      LIMIT 500
    `;
    res.json({ items: rows });
  })
);

// GET /api/issues/:id
// Drafts also report live availability per line so the UI can warn before validation.
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const issue = await prisma.goodsIssue.findUnique({ where: { id }, include: DOC_INCLUDE });
    if (!issue) throw new NotFoundError('GoodsIssue', id);

    if (issue.status === 'DRAFT') {
      const levels = await prisma.stockLevel.findMany({
        where: {
          warehouseId: issue.warehouseId,
          productId: { in: issue.lines.map((l) => l.productId) },
        },
        select: { productId: true, quantity: true },
      });
      const available = new Map(levels.map((l) => [l.productId, l.quantity]));
      // Availability is compared against baseQuantity: 3 cartons of 12 need 36
      // bottles on the shelf, not 3.
      issue.lines = issue.lines.map((line) => ({
        ...line,
        available: available.get(line.productId) ?? 0,
        sufficient: (available.get(line.productId) ?? 0) >= line.baseQuantity,
      }));
    }

    res.json(issue);
  })
);

// POST /api/issues
router.post(
  '/',
  authorize('ADMIN', 'MAGASINIER'),
  asyncHandler(async (req, res) => {
    const { lines, ...data } = createIssueSchema.parse(req.body);

    if (data.destWarehouseId) {
      const dest = await prisma.warehouse.findUnique({ where: { id: data.destWarehouseId } });
      if (!dest) throw new NotFoundError('Warehouse', data.destWarehouseId);
    }

    // Conversion happens once, here, against the product's current factor and
    // price — both are then frozen on the line, so a later change to either
    // cannot rewrite what this document says.
    const products = await prisma.product.findMany({
      where: { id: { in: [...new Set(lines.map((l) => l.productId))] } },
    });
    const productById = new Map(products.map((p) => [p.id, p]));

    const resolvedLines = lines.map((line) => {
      const product = productById.get(line.productId);
      if (!product) throw new NotFoundError('Product', line.productId);
      return resolveIssueLine(product, line);
    });

    const issue = await prisma.$transaction(async (tx) => {
      const number = await allocateNumber(tx, 'ISSUE');
      return tx.goodsIssue.create({
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
      action: 'CREATE_ISSUE',
      entity: 'GoodsIssue',
      entityId: issue.id,
      after: { number: issue.number, lines: lines.length },
      ipAddress: clientIp(req),
    });

    res.status(201).json(issue);
  })
);

// PATCH /api/issues/:id — drafts only.
router.patch(
  '/:id',
  authorize('ADMIN', 'MAGASINIER'),
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const { lines, ...data } = updateIssueSchema.parse(req.body);

    const existing = await prisma.goodsIssue.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('GoodsIssue', id);
    if (existing.status !== 'DRAFT') throw new ConflictError('DOCUMENT_NOT_DRAFT');

    // Edited lines are re-resolved, not stored raw: an untouched `packaging`
    // still needs its baseQuantity and price recomputed.
    let resolvedLines = null;
    if (lines) {
      const products = await prisma.product.findMany({
        where: { id: { in: [...new Set(lines.map((l) => l.productId))] } },
      });
      const productById = new Map(products.map((p) => [p.id, p]));
      resolvedLines = lines.map((line) => {
        const product = productById.get(line.productId);
        if (!product) throw new NotFoundError('Product', line.productId);
        return resolveIssueLine(product, line);
      });
    }

    const issue = await prisma.$transaction(async (tx) => {
      if (resolvedLines) {
        await tx.goodsIssueLine.deleteMany({ where: { issueId: id } });
        await tx.goodsIssueLine.createMany({
          data: resolvedLines.map((l) => ({ ...l, issueId: id })),
        });
      }
      return tx.goodsIssue.update({ where: { id }, data, include: DOC_INCLUDE });
    });

    res.json(issue);
  })
);

// POST /api/issues/:id/validate
// Enforces BR-2 (no negative stock) and BR-7 (transfers are atomic pairs).
router.post(
  '/:id/validate',
  authorize('ADMIN', 'MAGASINIER'),
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const { allowNegative = false } = validateDocSchema.parse(req.body ?? {});

    // BR-3: only an ADMIN may knowingly drive stock negative, and the override
    // is recorded in the audit trail below.
    if (allowNegative && req.user.role !== 'ADMIN') {
      throw new ForbiddenError('NEGATIVE_OVERRIDE_REQUIRES_ADMIN');
    }

    const issue = await prisma.$transaction(async (tx) => {
      const doc = await tx.goodsIssue.findUnique({ where: { id }, include: { lines: true } });
      if (!doc) throw new NotFoundError('GoodsIssue', id);
      if (doc.status === 'VALIDATED') throw new ConflictError('DOCUMENT_ALREADY_VALIDATED');
      if (doc.status === 'CANCELLED') throw new ConflictError('DOCUMENT_CANCELLED');
      if (doc.lines.length === 0) throw new ConflictError('EMPTY_DOCUMENT');
      if (doc.reason === 'TRANSFER' && !doc.destWarehouseId) {
        throw new ConflictError('DEST_WAREHOUSE_REQUIRED');
      }

      // Leaving the source warehouse. Throws InsufficientStockError on any line.
      await applyMovements(
        tx,
        doc.lines.map((line) => ({
          type: 'OUT',
          productId: line.productId,
          warehouseId: doc.warehouseId,
          quantity: line.baseQuantity,
          reason: doc.reason,
          refType: 'GoodsIssue',
          refId: doc.id,
          userId: req.user.id,
          allowNegative,
        }))
      );

      // BR-7: the matching entry happens in the same transaction, so a transfer
      // can never lose goods in flight between the two sites.
      if (doc.reason === 'TRANSFER') {
        await applyMovements(
          tx,
          doc.lines.map((line) => ({
            type: 'IN',
            productId: line.productId,
            warehouseId: doc.destWarehouseId,
            quantity: line.baseQuantity,
            reason: `Transfert ${doc.number}`,
            refType: 'GoodsIssue',
            refId: doc.id,
            userId: req.user.id,
          }))
        );
      }

      return tx.goodsIssue.update({
        where: { id },
        data: { status: 'VALIDATED', validatedAt: new Date(), validatedById: req.user.id },
        include: DOC_INCLUDE,
      });
    });

    checkThresholdsAsync(affectedPairs(issue));

    await recordAudit({
      userId: req.user.id,
      action: allowNegative ? 'VALIDATE_ISSUE_NEGATIVE_OVERRIDE' : 'VALIDATE_ISSUE',
      entity: 'GoodsIssue',
      entityId: id,
      after: { number: issue.number, lines: issue.lines.length, allowNegative },
      ipAddress: clientIp(req),
    });

    res.json(issue);
  })
);

// POST /api/issues/:id/cancel — returns the goods to stock (BR-9).
router.post(
  '/:id/cancel',
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const { reason } = cancelDocSchema.parse(req.body);

    const issue = await prisma.$transaction(async (tx) => {
      const doc = await tx.goodsIssue.findUnique({ where: { id }, include: { lines: true } });
      if (!doc) throw new NotFoundError('GoodsIssue', id);
      if (doc.status === 'CANCELLED') throw new ConflictError('DOCUMENT_CANCELLED');

      if (doc.status === 'VALIDATED') {
        await applyMovements(
          tx,
          doc.lines.map((line) => ({
            type: 'IN',
            productId: line.productId,
            warehouseId: doc.warehouseId,
            quantity: line.baseQuantity,
            reason: `Annulation ${doc.number}: ${reason}`,
            refType: 'GoodsIssue',
            refId: doc.id,
            userId: req.user.id,
          }))
        );

        // Undo the paired entry at the destination too.
        if (doc.reason === 'TRANSFER' && doc.destWarehouseId) {
          await applyMovements(
            tx,
            doc.lines.map((line) => ({
              type: 'OUT',
              productId: line.productId,
              warehouseId: doc.destWarehouseId,
              quantity: line.baseQuantity,
              reason: `Annulation transfert ${doc.number}`,
              refType: 'GoodsIssue',
              refId: doc.id,
              userId: req.user.id,
            }))
          );
        }
      }

      return tx.goodsIssue.update({
        where: { id },
        data: { status: 'CANCELLED', notes: reason },
        include: DOC_INCLUDE,
      });
    });

    checkThresholdsAsync(affectedPairs(issue));

    await recordAudit({
      userId: req.user.id,
      action: 'CANCEL_ISSUE',
      entity: 'GoodsIssue',
      entityId: id,
      after: { number: issue.number, reason },
      ipAddress: clientIp(req),
    });

    res.json(issue);
  })
);

module.exports = router;
