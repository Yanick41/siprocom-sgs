'use strict';

const { ZodError } = require('zod');
const { AppError } = require('../lib/errors');
const logger = require('../lib/logger');
const config = require('../config/env');

/** 404 fallback for unmatched routes. */
const notFoundHandler = (req, res) => {
  res.status(404).json({ error: { code: 'ROUTE_NOT_FOUND', details: { path: req.originalUrl } } });
};

/**
 * Single exit point for every error. Always emits the uniform envelope:
 *   { error: { code, details? } }
 */
// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity
const errorHandler = (err, req, res, next) => {
  // Body/query validation
  if (err instanceof ZodError) {
    return res.status(422).json({
      error: {
        code: 'VALIDATION_FAILED',
        details: err.issues.map((i) => ({ path: i.path.join('.'), rule: i.code })),
      },
    });
  }

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({ err, path: req.originalUrl }, 'Application error');
    } else {
      logger.warn({ code: err.code, path: req.originalUrl }, 'Handled error');
    }
    return res.status(err.statusCode).json({
      error: { code: err.code, ...(err.details ? { details: err.details } : {}) },
    });
  }

  // Prisma known errors → stable codes
  if (err.code === 'P2002') {
    return res
      .status(409)
      .json({ error: { code: 'DUPLICATE_VALUE', details: { fields: err.meta?.target } } });
  }
  if (err.code === 'P2025') {
    return res.status(404).json({ error: { code: 'NOT_FOUND' } });
  }
  if (err.code === 'P2003') {
    return res
      .status(409)
      .json({ error: { code: 'FOREIGN_KEY_CONSTRAINT', details: { field: err.meta?.field_name } } });
  }

  logger.error({ err, path: req.originalUrl }, 'Unhandled error');
  return res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      ...(config.isProduction ? {} : { details: { message: err.message } }),
    },
  });
};

/** Wraps async route handlers so rejections reach the error handler. */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { errorHandler, notFoundHandler, asyncHandler };
