'use strict';

const express = require('express');
const prisma = require('../lib/prisma');
const { NotFoundError, ValidationError } = require('../lib/errors');
const { recordAudit, clientIp } = require('../lib/audit');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate, authorize } = require('../middleware/authenticate');
const { parseListQuery, paginated } = require('../utils/pagination');
const {
  createProductSchema,
  updateProductSchema,
  idParamSchema,
} = require('../validators/reference.validator');

const router = express.Router();
router.use(authenticate);

const SORTABLE = ['reference', 'designation', 'createdAt', 'minThreshold', 'buyPrice', 'sellPrice'];

/** Surfaces the stock level as a plain number for list views. */
const withTotalStock = (product) => ({
  ...product,
  totalStock: product.stockLevel?.quantity ?? 0,
});

// GET /api/products
// Filters: search, categoryId, supplierId, status (active|inactive|all), stockState (low|out|over)
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = parseListQuery(req.query, { sortable: SORTABLE, defaultSort: 'designation' });
    const { categoryId, supplierId, status = 'active', stockState } = req.query;

    const where = {
      ...(status === 'all' ? {} : { isActive: status !== 'inactive' }),
      ...(categoryId ? { categoryId } : {}),
      ...(supplierId ? { suppliers: { some: { supplierId } } } : {}),
      ...(q.search
        ? {
            OR: [
              { reference: { contains: q.search, mode: 'insensitive' } },
              { designation: { contains: q.search, mode: 'insensitive' } },
              { designationEn: { contains: q.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip: q.skip,
        take: q.take,
        orderBy: q.orderBy,
        include: {
          category: { select: { id: true, name: true, nameEn: true } },
          stockLevel: { select: { quantity: true } },
        },
      }),
      prisma.product.count({ where }),
    ]);

    let items = rows.map(withTotalStock);

    // Stock-state filtering happens after aggregation because the threshold
    // comparison spans the product row and its summed levels. Only meaningful
    // within the current page; the dedicated /api/stock endpoint (Phase 3)
    // handles whole-catalogue stock queries.
    if (stockState === 'low') {
      items = items.filter((p) => p.totalStock > 0 && p.totalStock < p.minThreshold);
    } else if (stockState === 'out') {
      items = items.filter((p) => p.totalStock <= 0);
    } else if (stockState === 'over') {
      items = items.filter((p) => p.maxThreshold != null && p.totalStock > p.maxThreshold);
    }

    res.json(paginated(items, total, q));
  })
);

// GET /api/products/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        suppliers: { include: { supplier: true } },
        stockLevel: true,
      },
    });
    if (!product) throw new NotFoundError('Product', id);

    res.json(withTotalStock(product));
  })
);

// POST /api/products
router.post(
  '/',
  authorize('ADMIN', 'MAGASINIER'),
  asyncHandler(async (req, res) => {
    const { supplierIds, ...data } = createProductSchema.parse(req.body);

    const product = await prisma.product.create({
      data: {
        ...data,
        ...(supplierIds?.length
          ? { suppliers: { create: supplierIds.map((supplierId) => ({ supplierId })) } }
          : {}),
      },
      include: { category: true },
    });

    await recordAudit({
      userId: req.user.id,
      action: 'CREATE_PRODUCT',
      entity: 'Product',
      entityId: product.id,
      after: product,
      ipAddress: clientIp(req),
    });

    res.status(201).json(product);
  })
);

// PATCH /api/products/:id
router.patch(
  '/:id',
  authorize('ADMIN', 'MAGASINIER'),
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const { supplierIds, ...data } = updateProductSchema.parse(req.body);

    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Product', id);

    // Threshold rules are cross-field: a partial update can only be checked
    // against the merged result, not the payload alone.
    const nextMin = data.minThreshold ?? existing.minThreshold;
    const nextMax = data.maxThreshold === undefined ? existing.maxThreshold : data.maxThreshold;
    if (nextMax != null && nextMax < nextMin) {
      throw new ValidationError([{ path: 'maxThreshold', rule: 'MAX_BELOW_MIN' }]);
    }

    const product = await prisma.$transaction(async (tx) => {
      if (supplierIds) {
        await tx.productSupplier.deleteMany({ where: { productId: id } });
        if (supplierIds.length) {
          await tx.productSupplier.createMany({
            data: supplierIds.map((supplierId) => ({ productId: id, supplierId })),
          });
        }
      }
      return tx.product.update({ where: { id }, data, include: { category: true } });
    });

    await recordAudit({
      userId: req.user.id,
      action: 'UPDATE_PRODUCT',
      entity: 'Product',
      entityId: id,
      before: existing,
      after: product,
      ipAddress: clientIp(req),
    });

    res.json(product);
  })
);

// PATCH /api/products/:id/deactivate
// Soft delete only — the movement ledger references this product forever (BR-4).
router.patch(
  '/:id/deactivate',
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Product', id);

    const product = await prisma.product.update({ where: { id }, data: { isActive: false } });

    await recordAudit({
      userId: req.user.id,
      action: 'DEACTIVATE_PRODUCT',
      entity: 'Product',
      entityId: id,
      before: existing,
      after: product,
      ipAddress: clientIp(req),
    });

    res.json(product);
  })
);

// PATCH /api/products/:id/activate
router.patch(
  '/:id/activate',
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const product = await prisma.product.update({ where: { id }, data: { isActive: true } });

    await recordAudit({
      userId: req.user.id,
      action: 'ACTIVATE_PRODUCT',
      entity: 'Product',
      entityId: id,
      after: product,
      ipAddress: clientIp(req),
    });

    res.json(product);
  })
);

module.exports = router;
