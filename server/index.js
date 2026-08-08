'use strict';

const app = require('./src/app');
const config = require('./src/config/env');
const logger = require('./src/lib/logger');

// Vercel imports the app and handles listening itself.
if (!process.env.VERCEL) {
  const server = app.listen(config.port, () => {
    logger.info(`SIPROCOM SGS API listening on http://localhost:${config.port} [${config.nodeEnv}]`);
  });

  const shutdown = (signal) => {
    logger.info(`${signal} received — shutting down`);
    server.close(() => process.exit(0));
    // Don't hang forever on lingering keep-alive sockets.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled promise rejection');
  });
}

module.exports = app;
