'use strict';

const express = require('express');
const prisma = require('../lib/prisma');
const { NotFoundError, ForbiddenError } = require('../lib/errors');
const { recordAudit, clientIp } = require('../lib/audit');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate, authorize } = require('../middleware/authenticate');
const { parseListQuery, paginated } = require('../utils/pagination');
const { applyMovement, reconcile } = require('../services/stock.service');
const { adjustStockSchema, idParamSchema } = require('../validators/stock.validator');

const router = express.Router();
router.use(authenticate);

// GET /api/stock — levels per product/warehouse, with threshold state.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = parseListQuery(req.query, { sortable: ['quantity'], defaultSort: 'quantity' });
    const { warehouseId, categoryId, state } = req.query;

    const where = {
      ...(warehouseId ? { warehouseId } : {}),
      product: {
        isActive: true,
        ...(categoryId ? { categoryId } : {}),
        ...(q.search
          ? {
              OR: [
                { reference: { contains: q.search, mode: 'insensitive' } },
                { designation: { contains: q.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
    };

    const [rows, total] = await Promise.all([
      prisma.stockLevel.findMany({
        where,
        skip: q.skip,
        take: q.take,
        orderBy: q.orderBy,
        include: {
          product: {
            select: {
              id: true, reference: true, designation: true, designationEn: true,
              unit: true, minThreshold: true, maxThreshold: true,
            },
          },
          warehouse: { select: { id: true, code: true, name: true } },
        },
      }),
      prisma.stockLevel.count({ where }),
    ]);

    const items = rows.map((row) => ({
      ...row,
      state:
        row.quantity <= 0
          ? 'OUT_OF_STOCK'
          : row.quantity < row.product.minThreshold
            ? 'BELOW_MIN'
            : row.product.maxThreshold != null && row.quantity > row.product.maxThreshold
              ? 'ABOVE_MAX'
              : 'OK',
    }));

    res.json(paginated(state ? items.filter((i) => i.state === state) : items, total, q));
  })
);

// GET /api/stock/reconcile — proves the materialised levels against the ledger.
// Declared before /product/:id so "reconcile" is never read as an id.
router.get(
  '/reconcile',
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    res.json(await reconcile(prisma));
  })
);

// GET /api/stock/movements — the journal de stock (§4.4).
router.get(
  '/movements',
  asyncHandler(async (req, res) => {
    const q = parseListQuery(req.query, { sortable: ['createdAt'], defaultSort: 'createdAt' });
    const { productId, warehouseId, type, from, to, userId } = req.query;

    const where = {
      ...(productId ? { productId } : {}),
      ...(warehouseId ? { warehouseId } : {}),
      ...(type ? { type } : {}),
      ...(userId ? { userId } : {}),
      ...(from || to
        ? { createdAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.stockMovement.findMany({
        where,
        skip: q.skip,
        take: q.take,
        orderBy: q.orderBy,
        include: {
          product: { select: { id: true, reference: true, designation: true, designationEn: true, unit: true } },
          warehouse: { select: { id: true, code: true, name: true } },
          user: { select: { id: true, name: true } },
        },
      }),
      prisma.stockMovement.count({ where }),
    ]);

    res.json(paginated(items, total, q));
  })
);

// GET /api/stock/product/:id — per-warehouse breakdown plus recent history.
router.get(
  '/product/:id',
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true, nameEn: true } },
        stockLevels: { include: { warehouse: { select: { id: true, code: true, name: true } } } },
      },
    });
    if (!product) throw new NotFoundError('Product', id);

    const movements = await prisma.stockMovement.findMany({
      where: { productId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        warehouse: { select: { id: true, code: true, name: true } },
        user: { select: { id: true, name: true } },
      },
    });

    const totalStock = product.stockLevels.reduce((sum, level) => sum + level.quantity, 0);

    res.json({ product, totalStock, movements });
  })
);

// POST /api/stock/adjust — inventory correction. Reason is mandatory (BR-6).
router.post(
  '/adjust',
  authorize('ADMIN', 'MAGASINIER'),
  asyncHandler(async (req, res) => {
    const { productId, warehouseId, countedQuantity, reason, allowNegative = false } =
      adjustStockSchema.parse(req.body);

    if (allowNegative && req.user.role !== 'ADMIN') {
      throw new ForbiddenError('NEGATIVE_OVERRIDE_REQUIRES_ADMIN');
    }

    const result = await prisma.$transaction(async (tx) => {
      const level = await tx.stockLevel.findUnique({
        where: { productId_warehouseId: { productId, warehouseId } },
        select: { quantity: true },
      });
      const theoretical = level?.quantity ?? 0;
      const delta = countedQuantity - theoretical;

      if (delta === 0) return { theoretical, counted: countedQuantity, delta: 0, movement: null };

      // Signed ADJUSTMENT: positive for a surplus found, negative for shrinkage.
      const { movement, balanceAfter } = await applyMovement(tx, {
        type: 'ADJUSTMENT',
        productId,
        warehouseId,
        quantity: delta,
        reason,
        refType: 'Adjustment',
        userId: req.user.id,
        allowNegative,
      });

      return { theoretical, counted: countedQuantity, delta, balanceAfter, movement };
    });

    await recordAudit({
      userId: req.user.id,
      action: 'ADJUST_STOCK',
      entity: 'Product',
      entityId: productId,
      before: { quantity: result.theoretical },
      after: { quantity: result.counted, delta: result.delta, reason, warehouseId },
      ipAddress: clientIp(req),
    });

    res.json(result);
  })
);

module.exports = router;
