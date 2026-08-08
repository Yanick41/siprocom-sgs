'use strict';

const express = require('express');
const { checkDatabase } = require('../lib/prisma');
const { asyncHandler } = require('../middleware/errorHandler');
const config = require('../config/env');

const router = express.Router();

// GET /api/health — public liveness + DB readiness probe.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const db = await checkDatabase();
    res.status(db.connected ? 200 : 503).json({
      ok: db.connected,
      db: db.connected,
      env: config.nodeEnv,
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      ...(db.connected ? {} : { hint: 'Check DATABASE_URL and that migrations have been applied.' }),
    });
  })
);

module.exports = router;
