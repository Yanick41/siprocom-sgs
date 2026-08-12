'use strict';

const app = require('./src/app');
const config = require('./src/config/env');
const logger = require('./src/lib/logger');
const { startScheduler } = require('./src/lib/scheduler');

// Vercel imports the app and handles listening itself.
if (!process.env.VERCEL) {
  const server = app.listen(config.port, () => {
    logger.info(`SIPROCOM SGS API listening on http://localhost:${config.port} [${config.nodeEnv}]`);

    /**
     * A dev server pointed at a remote database is invisible until something
     * writes. .env gets switched to production for a migration and left there,
     * and the next test movement lands in real data — that is how the demo seed
     * wiped this project's Neon database once already.
     */
    if (!config.isProduction) {
      try {
        const host = new URL(config.databaseUrl).hostname;
        if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
          logger.warn(
            `DEVELOPMENT SERVER IS WRITING TO A REMOTE DATABASE: ${host}. ` +
              'Every movement you record here is real data. Point DATABASE_URL back ' +
              'at localhost, and reach production one command at a time with ' +
              '`npm run prod -- <command>`.'
          );
        }
      } catch {
        /* an unreadable URL is already reported elsewhere */
      }
    }
  });

  const scheduler = startScheduler();

  const shutdown = (signal) => {
    logger.info(`${signal} received — shutting down`);
    scheduler?.stop();
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
