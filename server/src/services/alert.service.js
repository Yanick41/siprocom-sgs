'use strict';

const prisma = require('../lib/prisma');
const logger = require('../lib/logger');

/**
 * Threshold alerting (§4.5, BR-8).
 *
 * Runs AFTER the movement transaction commits, not inside it: alerting must
 * never extend the locks held by a stock update, and "after every committed
 * movement" is exactly what the rule asks for. The trade-off is that an alert
 * can lag a movement by milliseconds — acceptable, and the daily sweep is the
 * backstop.
 *
 * Alerts are idempotent: one OPEN alert per (product, type). Crossing
 * the threshold repeatedly does not pile up duplicates, and returning to a
 * healthy level resolves the open alert automatically.
 */

/**
 * @param {string[]} productIds
 */
async function checkThresholds(productIds) {
  if (!productIds?.length) return { opened: 0, resolved: 0 };

  // De-duplicate: a multi-line document often names the same product twice.
  const unique = [...new Set(productIds)];

  const levels = await prisma.stockLevel.findMany({
    where: { productId: { in: unique } },
    include: { product: { select: { minThreshold: true, maxThreshold: true, isActive: true } } },
  });

  let opened = 0;
  let resolved = 0;

  for (const level of levels) {
    if (!level.product.isActive) continue;

    const { minThreshold, maxThreshold } = level.product;
    const belowMin = level.quantity < minThreshold;
    const aboveMax = maxThreshold != null && level.quantity > maxThreshold;

    const states = [
      { type: 'MIN_THRESHOLD', breached: belowMin, threshold: minThreshold },
      { type: 'MAX_THRESHOLD', breached: aboveMax, threshold: maxThreshold ?? 0 },
    ];

    for (const { type, breached, threshold } of states) {
      const existing = await prisma.alert.findFirst({
        where: {
          productId: level.productId,
          type,
          status: { in: ['OPEN', 'ACKNOWLEDGED'] },
        },
      });

      if (breached && !existing) {
        await prisma.alert.create({
          data: {
            productId: level.productId,
            type,
            status: 'OPEN',
            quantityAtTrigger: level.quantity,
            thresholdValue: threshold,
          },
        });
        opened += 1;
      } else if (!breached && existing) {
        await prisma.alert.update({
          where: { id: existing.id },
          data: { status: 'RESOLVED', resolvedAt: new Date() },
        });
        resolved += 1;
      }
    }
  }

  return { opened, resolved };
}

/**
 * Fire-and-forget wrapper for route handlers.
 * A failure here must never turn a successful stock movement into an error
 * response — the movement is already committed and correct.
 */
function checkThresholdsAsync(productIds) {
  checkThresholds(productIds).catch((error) => {
    logger.error({ err: error }, 'Threshold check failed after movement');
  });
}

/**
 * Full catalogue sweep — the backstop behind the per-movement checks.
 * Catches anything missed while the server was down, and any threshold that was
 * edited on the product rather than crossed by a movement.
 */
async function sweepAll() {
  const levels = await prisma.stockLevel.findMany({ select: { productId: true } });
  return checkThresholds(levels.map((level) => level.productId));
}

module.exports = { checkThresholds, checkThresholdsAsync, sweepAll };
