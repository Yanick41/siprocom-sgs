'use strict';

const { PrismaClient } = require('@prisma/client');
const config = require('../config/env');
const logger = require('./logger');

/**
 * Single Prisma instance.
 *
 * Reused via globalThis so that (a) nodemon restarts don't leak connections and
 * (b) warm serverless invocations share one pool — exhausting Postgres
 * connections is the classic way to blow the <2s response NFR.
 */
const createClient = () =>
  new PrismaClient({
    log: config.isProduction ? ['error'] : ['warn', 'error'],
  });

const prisma = globalThis.__sgsPrisma ?? createClient();

if (!config.isProduction) {
  globalThis.__sgsPrisma = prisma;
}

/** Cheap liveness probe used by /api/health. */
const checkDatabase = async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { connected: true };
  } catch (error) {
    logger.warn({ err: error.message }, 'Database health check failed');
    return { connected: false, reason: error.message };
  }
};

module.exports = prisma;
module.exports.prisma = prisma;
module.exports.checkDatabase = checkDatabase;
