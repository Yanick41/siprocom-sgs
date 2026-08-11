'use strict';

const express = require('express');
const prisma = require('../lib/prisma');
const config = require('../config/env');
const { NotFoundError, UnauthorizedError } = require('../lib/errors');
const { recordAudit, clientIp } = require('../lib/audit');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate, authorize } = require('../middleware/authenticate');
const { parseListQuery, paginated } = require('../utils/pagination');
const { sweepAll } = require('../services/alert.service');
const { idParamSchema } = require('../validators/stock.validator');

const router = express.Router();

/**
 * Scheduled backstop sweep. Machine-to-machine, so it carries a shared secret
 * rather than a user session — hence it is declared before `authenticate`.
 *
 * GET and POST both work: Vercel Cron issues a GET with
 * `Authorization: Bearer $CRON_SECRET`, while a plain curl or another scheduler
 * is more naturally a POST with `x-cron-secret`. Supporting only one convention
 * means the sweep silently never runs on the other platform.
 *
 * An empty CRON_SECRET rejects everything: an unauthenticated endpoint that
 * walks the whole catalogue is not something to leave open by accident.
 */
const sweepHandler = asyncHandler(async (req, res) => {
  const bearer = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const provided = req.get('x-cron-secret') || bearer || req.query.secret;

  if (!config.cronSecret || provided !== config.cronSecret) {
    throw new UnauthorizedError('INVALID_CRON_SECRET');
  }

  const result = await sweepAll();
  res.json({ ok: true, ...result });
});

router.get('/sweep', sweepHandler);
router.post('/sweep', sweepHandler);

router.use(authenticate);

// GET /api/alerts
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = parseListQuery(req.query, { sortable: ['createdAt'], defaultSort: 'createdAt' });
    const { status = 'OPEN', type, warehouseId } = req.query;

    const where = {
      ...(status === 'all' ? {} : { status }),
      ...(type ? { type } : {}),
      ...(warehouseId ? { warehouseId } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.alert.findMany({
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
      prisma.alert.count({ where }),
    ]);

    // Report the live quantity, not the figure captured when the alert opened.
    const levels = await prisma.stockLevel.findMany({
      where: { OR: items.map((a) => ({ productId: a.productId, warehouseId: a.warehouseId })) },
      select: { productId: true, warehouseId: true, quantity: true },
    });
    const byPair = new Map(levels.map((l) => [`${l.productId}:${l.warehouseId}`, l.quantity]));

    res.json(
      paginated(
        items.map((a) => ({
          ...a,
          currentQuantity: byPair.get(`${a.productId}:${a.warehouseId}`) ?? 0,
        })),
        total,
        q
      )
    );
  })
);

// GET /api/alerts/count — drives the topbar badge.
router.get(
  '/count',
  asyncHandler(async (req, res) => {
    const [min, max] = await Promise.all([
      prisma.alert.count({ where: { status: 'OPEN', type: 'MIN_THRESHOLD' } }),
      prisma.alert.count({ where: { status: 'OPEN', type: 'MAX_THRESHOLD' } }),
    ]);
    res.json({ total: min + max, minThreshold: min, maxThreshold: max });
  })
);

// POST /api/alerts/:id/acknowledge
router.post(
  '/:id/acknowledge',
  authorize('ADMIN', 'ACHATS'),
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);

    const existing = await prisma.alert.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Alert', id);

    const alert = await prisma.alert.update({
      where: { id },
      data: { status: 'ACKNOWLEDGED', acknowledgedAt: new Date() },
    });

    await recordAudit({
      userId: req.user.id,
      action: 'ACKNOWLEDGE_ALERT',
      entity: 'Alert',
      entityId: id,
      ipAddress: clientIp(req),
    });

    res.json(alert);
  })
);

module.exports = router;
