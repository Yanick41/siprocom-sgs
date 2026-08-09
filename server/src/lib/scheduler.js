'use strict';

const cron = require('node-cron');
const logger = require('./logger');
const { sweepAll } = require('../services/alert.service');

/**
 * Scheduled jobs (§7.3 "le système surveille en continu les niveaux de stock").
 *
 * The per-movement threshold check is the primary mechanism; this sweep is the
 * backstop. It catches thresholds edited on the product rather than crossed by
 * a movement, and anything missed while the process was down.
 *
 * Guarded by an env flag because on a multi-instance deployment every instance
 * would otherwise run the same sweep at the same minute. On serverless, leave
 * it off and drive POST /api/alerts/sweep from the platform's scheduler instead.
 */
function startScheduler() {
  if (process.env.ENABLE_SCHEDULER !== 'true') {
    logger.info('Scheduler disabled (set ENABLE_SCHEDULER=true to enable)');
    return null;
  }

  // 06:00 every day — before the warehouse opens, so ACHATS finds the
  // replenishment list already waiting.
  const job = cron.schedule(
    '0 6 * * *',
    async () => {
      try {
        const result = await sweepAll();
        logger.info({ ...result }, 'Daily alert sweep complete');
      } catch (error) {
        logger.error({ err: error }, 'Daily alert sweep failed');
      }
    },
    { timezone: process.env.TZ || 'Africa/Abidjan' }
  );

  logger.info('Scheduler started — daily alert sweep at 06:00');
  return job;
}

module.exports = { startScheduler };
