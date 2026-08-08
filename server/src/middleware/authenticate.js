'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config/env');
const prisma = require('../lib/prisma');
const { UnauthorizedError, ForbiddenError } = require('../lib/errors');
const { asyncHandler } = require('./errorHandler');

/**
 * Verifies the httpOnly JWT cookie and attaches the live user to req.user.
 *
 * The user is re-read from the database on every request rather than trusted
 * from the token payload: a role change or deactivation must take effect
 * immediately, not whenever the 8h token happens to expire.
 */
const authenticate = asyncHandler(async (req, res, next) => {
  const token = req.cookies?.[config.jwt.cookieName];
  if (!token) throw new UnauthorizedError();

  let payload;
  try {
    payload = jwt.verify(token, config.jwt.secret);
  } catch {
    throw new UnauthorizedError();
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, name: true, email: true, role: true, isActive: true, locale: true },
  });

  if (!user) throw new UnauthorizedError();
  if (!user.isActive) throw new ForbiddenError('ACCOUNT_DISABLED');

  req.user = user;
  next();
});

/**
 * Route guard: authorize('ADMIN', 'MAGASINIER').
 * Must be mounted after `authenticate`.
 */
const authorize =
  (...allowedRoles) =>
  (req, res, next) => {
    if (!req.user) return next(new UnauthorizedError());
    if (!allowedRoles.includes(req.user.role)) {
      return next(new ForbiddenError('FORBIDDEN', { required: allowedRoles }));
    }
    return next();
  };

module.exports = { authenticate, authorize };
