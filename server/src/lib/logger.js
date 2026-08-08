'use strict';

const pino = require('pino');
const config = require('../config/env');

/**
 * Structured logger. Pretty-printed locally, JSON in production so hosting
 * platforms can index it.
 */
const logger = pino({
  level: config.logLevel,
  transport: config.isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
      },
  redact: {
    paths: ['req.headers.cookie', 'req.headers.authorization', '*.password', '*.token'],
    remove: true,
  },
});

module.exports = logger;
