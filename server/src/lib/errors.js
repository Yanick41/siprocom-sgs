'use strict';

/**
 * Application errors carry a stable machine-readable `code`, never a
 * human sentence — the client maps codes to translated messages so the API
 * stays locale-agnostic. See IMPLEMENTATION_PLAN.md §7 rule 5.
 */
class AppError extends Error {
  constructor(code, statusCode = 400, details = undefined) {
    super(code);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(details) {
    super('VALIDATION_FAILED', 422, details);
  }
}

class UnauthorizedError extends AppError {
  constructor(code = 'UNAUTHORIZED') {
    super(code, 401);
  }
}

class ForbiddenError extends AppError {
  constructor(code = 'FORBIDDEN', details = undefined) {
    super(code, 403, details);
  }
}

class NotFoundError extends AppError {
  constructor(entity, id) {
    super('NOT_FOUND', 404, { entity, id });
  }
}

class ConflictError extends AppError {
  constructor(code, details = undefined) {
    super(code, 409, details);
  }
}

/** Raised by stock.service when an OUT movement would drive stock negative (BR-2). */
class InsufficientStockError extends ConflictError {
  constructor({ productId, requested, available }) {
    super('INSUFFICIENT_STOCK', { productId, requested, available });
  }
}

module.exports = {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  InsufficientStockError,
};
