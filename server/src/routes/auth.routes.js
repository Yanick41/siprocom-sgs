'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

const config = require('../config/env');
const prisma = require('../lib/prisma');
const { UnauthorizedError, ForbiddenError } = require('../lib/errors');
const { recordAudit, clientIp } = require('../lib/audit');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/authenticate');
const { loginSchema, updateLocaleSchema } = require('../validators/auth.validator');

const router = express.Router();

// Brute-force protection on the only unauthenticated write endpoint.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: { code: 'TOO_MANY_REQUESTS' } },
});

const cookieOptions = () => ({
  httpOnly: true, // unreadable from JS — the point of not using localStorage
  secure: config.isProduction,
  sameSite: config.isProduction ? 'none' : 'lax', // 'none' when API and client are on different domains
  maxAge: 8 * 60 * 60 * 1000,
  path: '/',
});

const publicUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  locale: user.locale,
});

// POST /api/auth/login
router.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email } });

    // Same error and comparable timing whether the user exists or not,
    // so the endpoint can't be used to enumerate valid addresses.
    if (!user) {
      await bcrypt.compare(password, '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva');
      throw new UnauthorizedError('INVALID_CREDENTIALS');
    }

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) throw new UnauthorizedError('INVALID_CREDENTIALS');
    if (!user.isActive) throw new ForbiddenError('ACCOUNT_DISABLED');

    const token = jwt.sign({ sub: user.id, role: user.role }, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await recordAudit({
      userId: user.id,
      action: 'LOGIN',
      entity: 'User',
      entityId: user.id,
      ipAddress: clientIp(req),
    });

    res.cookie(config.jwt.cookieName, token, cookieOptions());
    res.json({ user: publicUser(user) });
  })
);

// POST /api/auth/logout
router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    res.clearCookie(config.jwt.cookieName, { ...cookieOptions(), maxAge: undefined });
    res.status(204).end();
  })
);

// GET /api/auth/me
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    res.json({ user: publicUser(req.user) });
  })
);

// PATCH /api/auth/me/locale — persists the language choice across devices.
router.patch(
  '/me/locale',
  authenticate,
  asyncHandler(async (req, res) => {
    const { locale } = updateLocaleSchema.parse(req.body);

    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: { locale },
    });

    res.json({ user: publicUser(updated) });
  })
);

module.exports = router;
