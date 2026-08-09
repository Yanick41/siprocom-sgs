'use strict';

const express = require('express');
const prisma = require('../lib/prisma');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate, authorize } = require('../middleware/authenticate');
const { parseListQuery, paginated } = require('../utils/pagination');

const router = express.Router();
router.use(authenticate, authorize('ADMIN'));

// GET /api/audit-logs — read-only by design; the trail is never edited.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = parseListQuery(req.query, { sortable: ['createdAt'], defaultSort: 'createdAt' });
    const { action, userId, entity, from, to } = req.query;

    const where = {
      ...(action ? { action } : {}),
      ...(userId ? { userId } : {}),
      ...(entity ? { entity } : {}),
      ...(from || to
        ? { createdAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip: q.skip,
        take: q.take,
        orderBy: q.orderBy,
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json(paginated(items, total, q));
  })
);

// GET /api/audit-logs/actions — distinct values, to populate the filter.
router.get(
  '/actions',
  asyncHandler(async (req, res) => {
    const rows = await prisma.auditLog.findMany({
      distinct: ['action'],
      select: { action: true },
      orderBy: { action: 'asc' },
    });
    res.json({ items: rows.map((r) => r.action) });
  })
);

module.exports = router;
