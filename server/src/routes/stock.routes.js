'use strict';

const express = require('express');
const prisma = require('../lib/prisma');
const { NotFoundError, ForbiddenError } = require('../lib/errors');
const { recordAudit, clientIp } = require('../lib/audit');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate, authorize } = require('../middleware/authenticate');
const { parseListQuery, paginated } = require('../utils/pagination');
const { applyMovement, reconcile } = require('../services/stock.service');
const { checkThresholdsAsync } = require('../services/alert.service');
const { adjustStockSchema, idParamSchema } = require('../validators/stock.validator');

const router = express.Router();
router.use(authenticate);

// GET /api/stock - one level per product, with threshold state.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = parseListQuery(req.query, { sortable: ['quantity'], defaultSort: 'quantity' });
    const { categoryId, state } = req.query;

    const where = {
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

// GET /api/stock/reconcile - proves the materialised levels against the ledger.
// Declared before /product/:id so "reconcile" is never read as an id.
router.get(
  '/reconcile',
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    res.json(await reconcile(prisma));
  })
);

// GET /api/stock/movements - the journal de stock (§4.4).
router.get(
  '/movements',
  asyncHandler(async (req, res) => {
    const q = parseListQuery(req.query, { sortable: ['createdAt'], defaultSort: 'createdAt' });
    const { productId, type, from, to, userId } = req.query;

    const where = {
      ...(productId ? { productId } : {}),
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
          user: { select: { id: true, name: true } },
        },
      }),
      prisma.stockMovement.count({ where }),
    ]);

    res.json(paginated(items, total, q));
  })
);

// GET /api/stock/product/:id - current level plus recent history.
router.get(
  '/product/:id',
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true, nameEn: true } },
        stockLevel: true,
      },
    });
    if (!product) throw new NotFoundError('Product', id);

    const movements = await prisma.stockMovement.findMany({
      where: { productId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        user: { select: { id: true, name: true } },
      },
    });

    const totalStock = product.stockLevels.reduce((sum, level) => sum + level.quantity, 0);

    res.json({ product, totalStock, movements });
  })
);

// POST /api/stock/adjust - inventory correction. Reason is mandatory (BR-6).
router.post(
  '/adjust',
  authorize('ADMIN', 'MAGASINIER'),
  asyncHandler(async (req, res) => {
    const { id, productId, countedQuantity, reason, allowNegative = false } =
      adjustStockSchema.parse(req.body);

    if (allowNegative && req.user.role !== 'ADMIN') {
      throw new ForbiddenError('NEGATIVE_OVERRIDE_REQUIRES_ADMIN');
    }

    // A replay of a correction already posted. The ledger is append-only, so
    // re-running it would leave two ADJUSTMENT rows and a level that no longer
    // matches the count that was taken. The stored movement carries everything
    // the original response did: quantity is the delta, and the level before
    // the correction is balanceAfter minus that delta.
    if (id) {
      const already = await prisma.stockMovement.findUnique({ where: { id } });
      if (already) {
        return res.json({
          theoretical: already.balanceAfter - already.quantity,
          counted: already.balanceAfter,
          delta: already.quantity,
          balanceAfter: already.balanceAfter,
          movement: already,
        });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const level = await tx.stockLevel.findUnique({
        where: { productId },
        select: { quantity: true },
      });
      const theoretical = level?.quantity ?? 0;
      const delta = countedQuantity - theoretical;

      if (delta === 0) return { theoretical, counted: countedQuantity, delta: 0, movement: null };

      // Signed ADJUSTMENT: positive for a surplus found, negative for shrinkage.
      const { movement, balanceAfter } = await applyMovement(tx, {
        id,
        type: 'ADJUSTMENT',
        productId,
        quantity: delta,
        reason,
        refType: 'Adjustment',
        userId: req.user.id,
        allowNegative,
      });

      return { theoretical, counted: countedQuantity, delta, balanceAfter, movement };
    });

    checkThresholdsAsync([productId]);

    await recordAudit({
      userId: req.user.id,
      action: 'ADJUST_STOCK',
      entity: 'Product',
      entityId: productId,
      before: { quantity: result.theoretical },
      after: { quantity: result.counted, delta: result.delta, reason },
      ipAddress: clientIp(req),
    });

    res.json(result);
  })
);

module.exports = router;
