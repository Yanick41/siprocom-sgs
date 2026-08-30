'use strict';

const express = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate, authorize } = require('../middleware/authenticate');
const analytics = require('../services/analytics.service');

const router = express.Router();
router.use(authenticate);

/** Resolves ?from/?to, defaulting to the last 30 days. */
const parsePeriod = (query) => {
  const to = query.to ? new Date(query.to) : new Date();
  const from = query.from ? new Date(query.from) : new Date(to.getTime() - 30 * 86_400_000);
  return { from, to };
};

// GET /api/reports/dashboard
router.get(
  '/dashboard',
  asyncHandler(async (req, res) => {
    res.json(await analytics.getDashboard());
  })
);

// GET /api/reports/trending?from&to&limit&categoryId
router.get(
  '/trending',
  asyncHandler(async (req, res) => {
    const { from, to } = parsePeriod(req.query);
    res.json(
      await analytics.getTrending({
        from,
        to,
        limit: Math.min(Number(req.query.limit) || 20, 100),
        categoryId: req.query.categoryId || null,
      })
    );
  })
);

// GET /api/reports/dormant
router.get(
  '/dormant',
  asyncHandler(async (req, res) => {
    const { from, to } = parsePeriod(req.query);
    res.json(
      await analytics.getDormant({
        from,
        to,
        limit: Math.min(Number(req.query.limit) || 50, 200),
      })
    );
  })
);

// GET /api/reports/movements-summary?groupBy=day|category
router.get(
  '/movements-summary',
  asyncHandler(async (req, res) => {
    const { from, to } = parsePeriod(req.query);
    res.json({
      from,
      to,
      groupBy: req.query.groupBy || 'day',
      items: await analytics.getMovementSummary({
        from,
        to,
        groupBy: req.query.groupBy || 'day',
      }),
    });
  })
);

// GET /api/reports/valuation - financial data, restricted (§3 roles).
router.get(
  '/valuation',
  authorize('ADMIN', 'DIRECTION'),
  asyncHandler(async (req, res) => {
    res.json(await analytics.getValuation());
  })
);

module.exports = router;
