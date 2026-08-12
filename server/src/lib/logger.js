'use strict';

const pino = require('pino');
const config = require('../config/env');

const REDACT = {
  paths: ['req.headers.cookie', 'req.headers.authorization', '*.password', '*.token'],
  remove: true,
};

/**
 * Structured logger. Pretty-printed locally, JSON everywhere else so hosting
 * platforms can index it.
 *
 * The pretty transport is doubly guarded. pino-pretty is a devDependency loaded
 * by name in a worker thread, so a bundler that never sees the string cannot
 * ship it: on Vercel this threw "unable to determine transport target for
 * pino-pretty" at module load, and since the logger is imported by everything,
 * the whole API failed to boot over a formatting nicety.
 *
 * NODE_ENV alone was not enough to prevent it — the platform did not set it to
 * production at runtime the way the build environment does. Serverless is
 * therefore detected directly, and the construction is wrapped: no logging
 * preference is worth taking the service down for.
 */
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const wantsPretty = !config.isProduction && !isServerless;

function createLogger() {
  if (!wantsPretty) return pino({ level: config.logLevel, redact: REDACT });

  try {
    return pino({
      level: config.logLevel,
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
      },
      redact: REDACT,
    });
  } catch {
    // pino-pretty missing or unresolvable — plain JSON is a fine second choice.
    return pino({ level: config.logLevel, redact: REDACT });
  }
}

module.exports = createLogger();
