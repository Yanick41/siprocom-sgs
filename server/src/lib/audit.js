'use strict';

const prisma = require('./prisma');
const logger = require('./logger');

/**
 * Records a sensitive action (§4.7 "journal des connexions et des actions sensibles").
 *
 * Auditing must never break the operation it is recording, so failures are
 * logged and swallowed. Pass `tx` to enrol the entry in a surrounding
 * transaction when the audit must be atomic with the change itself.
 */
async function recordAudit(
  { userId, action, entity, entityId, before, after, ipAddress },
  tx = prisma
) {
  try {
    await tx.auditLog.create({
      data: {
        userId: userId ?? null,
        action,
        entity: entity ?? null,
        entityId: entityId ?? null,
        before: before ?? undefined,
        after: after ?? undefined,
        ipAddress: ipAddress ?? null,
      },
    });
  } catch (error) {
    logger.error({ err: error, action }, 'Failed to write audit log');
  }
}

/** Extracts the client IP, accounting for the Vercel/Nginx proxy. */
const clientIp = (req) => req.ip || req.socket?.remoteAddress || null;

module.exports = { recordAudit, clientIp };
