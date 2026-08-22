'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { randomUUID } = require('node:crypto');

const config = require('../config/env');
const prisma = require('../lib/prisma');
const {
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  NotFoundError,
} = require('../lib/errors');
const { recordAudit, clientIp } = require('../lib/audit');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/authenticate');
const {
  completeSignup,
  setPasswordWithToken,
  inspectToken,
} = require('../services/account.service');
const {
  loginSchema,
  updateLocaleSchema,
  setupSchema,
  setPasswordSchema,
  tokenQuerySchema,
  signupRequestSchema,
  signupCompleteSchema,
} = require('../validators/auth.validator');

const router = express.Router();

/**
 * Tells the caller how long the wait is, instead of "a few minutes".
 *
 * Without a figure the screen cannot say anything useful, and a user who does
 * not know whether to wait 30 seconds or 15 minutes simply keeps retrying —
 * which extends the very window they are waiting on.
 */
const tooManyRequests = (req, res) => {
  const resetTime = req.rateLimit?.resetTime;
  const seconds = resetTime
    ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
    : 60;

  res.status(429).json({
    error: {
      code: 'TOO_MANY_REQUESTS',
      details: { retryAfterSeconds: seconds, retryAfterMinutes: Math.ceil(seconds / 60) },
    },
  });
};

/**
 * Brute-force protection on login, keyed by address AND account.
 *
 * Keying on the IP alone was a real defect for this deployment, not a
 * theoretical one: SIPROCOM's team works behind a single office connection, so
 * one shared public IP. A per-IP budget of five attempts meant one magasinier
 * mistyping their password five times locked out the administrator, the
 * purchasing manager and everyone else for a quarter of an hour.
 *
 * Per (IP, account) the mistakes stay with the person who made them.
 *
 * The window is short on purpose. Once the budget is spent even the correct
 * password is refused until it resets — that is how any rate limiter works, and
 * it is the part users actually feel. Ten tries buys enough room for someone
 * who cannot remember which password they chose, and five minutes is a bounded,
 * stated wait rather than a quarter of an hour of guessing why.
 *
 * It costs nothing against an attacker: bcrypt at cost 10 already makes each
 * guess expensive, and 2 880 guesses a day against a 12-character password is
 * not an attack.
 */
const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    return `${ipKeyGenerator(req.ip)}:${email}`;
  },
  handler: tooManyRequests,
});

/**
 * Backstop for the hole the key above opens: an attacker can rotate the email
 * and get a fresh budget each time. Deliberately generous — a whole office
 * failing fifty logins in fifteen minutes is a support problem, not traffic to
 * block, while anyone enumerating accounts passes it in seconds.
 */
const loginIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: tooManyRequests,
});

/**
 * The two endpoints that carry a token rather than an address.
 *
 * There is no account to key on — the body holds a token, not an email — so
 * this one is per IP and therefore shared by the whole office. It is set
 * generously for that reason: onboarding several colleagues in one afternoon
 * means a handful of requests each, and the screen re-checks the link on every
 * page load. Guessing is not the threat these guard against anyway; a 256-bit
 * single-use token is not reachable by brute force.
 */
const tokenLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: tooManyRequests,
});

/**
 * Signup attempts. Keyed per (IP, address) like login, so one colleague
 * fumbling a code never blocks the next person onboarding from the same office.
 */
const signupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    return `${ipKeyGenerator(req.ip)}:${email}`;
  },
  handler: tooManyRequests,
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


/**
 * First-run setup (§4.7 — accounts are created by an administrator; this is how
 * the very first one comes into existence on an empty database).
 *
 * Open only while the users table is empty. That window is the whole security
 * model, so it is closed with a conditional INSERT rather than a count-then-
 * create: under Read Committed, two requests arriving together would both read
 * zero and both create an administrator. The same discipline as the stock
 * decrement — the guard belongs in the statement, not around it.
 */

// GET /api/auth/setup-status — drives the login screen's "create an account" link.
router.get(
  '/setup-status',
  asyncHandler(async (req, res) => {
    const count = await prisma.user.count();
    res.json({ needsSetup: count === 0 });
  })
);

// POST /api/auth/setup
router.post(
  '/setup',
  loginIpLimiter,
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { name, email, password, locale } = setupSchema.parse(req.body);

    const passwordHash = await bcrypt.hash(password, config.bcryptRounds);
    const id = randomUUID();
    const now = new Date();

    // Inserts only if no user exists at all; returns nothing otherwise.
    const created = await prisma.$queryRaw`
      INSERT INTO users (id, name, email, password, role, locale, "isActive", "createdAt", "updatedAt")
      SELECT ${id}, ${name}, ${email}, ${passwordHash}, 'ADMIN', ${locale}, true, ${now}, ${now}
      WHERE NOT EXISTS (SELECT 1 FROM users)
      RETURNING id, name, email, role, locale
    `;

    if (created.length === 0) throw new ConflictError('SETUP_ALREADY_DONE');
    const user = created[0];

    await recordAudit({
      userId: user.id,
      action: 'SETUP_FIRST_ADMIN',
      entity: 'User',
      entityId: user.id,
      after: { email: user.email },
      ipAddress: clientIp(req),
    });

    const token = jwt.sign({ sub: user.id, role: user.role }, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    });
    res.cookie(config.jwt.cookieName, token, cookieOptions());

    res.status(201).json({ user });
  })
);

/**
 * Account activation and password recovery.
 *
 * One mechanism serves both: an invitation lets a new colleague choose their
 * first password, a reset lets an existing one replace a forgotten password.
 * The screen and the endpoint are the same; only the email differs.
 */

// GET /api/auth/token?token=… — is this link still good?
// Lets the screen say "expired" instead of showing a form that fails on submit.
router.get(
  '/token',
  tokenLimiter,
  asyncHandler(async (req, res) => {
    const { token } = tokenQuerySchema.parse(req.query);
    res.json(await inspectToken(token));
  })
);

// POST /api/auth/set-password
router.post(
  '/set-password',
  tokenLimiter,
  asyncHandler(async (req, res) => {
    const { token, password } = setPasswordSchema.parse(req.body);
    const { user, type } = await setPasswordWithToken(token, password);

    await recordAudit({
      userId: user.id,
      action: type === 'INVITATION' ? 'ACTIVATE_ACCOUNT' : 'RESET_PASSWORD',
      entity: 'User',
      entityId: user.id,
      ipAddress: clientIp(req),
    });

    // A disabled account can hold a valid link — an administrator may have
    // deactivated it after inviting. Setting the password is allowed; signing
    // in is not, and login gives the same answer.
    if (!user.isActive) throw new ForbiddenError('ACCOUNT_DISABLED');

    // Signing them in here saves re-typing a password chosen ten seconds ago;
    // the click on a link only they received is the proof.
    const jwtToken = jwt.sign({ sub: user.id, role: user.role }, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    });
    res.cookie(config.jwt.cookieName, jwtToken, cookieOptions());

    res.json({ user: publicUser(user) });
  })
);

/**
 * Self-service signup for an invited colleague (BR-11).
 *
 * The administrator opens the door by inviting an address and choosing a role;
 * the person then fills in their own name and password here and confirms a
 * six-digit code. Two endpoints, because the screen is two steps — but nothing
 * is written until the code is proved, so an abandoned signup leaves no
 * half-built account behind.
 */

// POST /api/auth/signup/check — step 1 submitted: is there an invitation?
//
// It sends nothing. The code was handed to the administrator when they
// invited; this only tells the screen whether to move on, so nobody fills in
// a whole form before learning there is nothing waiting for them.
router.post(
  '/signup/check',
  signupLimiter,
  asyncHandler(async (req, res) => {
    const { email } = signupRequestSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new NotFoundError('Invitation', email);
    if (user.password) throw new ConflictError('ACCOUNT_ALREADY_ACTIVATED');
    if (!user.isActive) throw new ForbiddenError('ACCOUNT_DISABLED');

    res.json({ ok: true });
  })
);

// POST /api/auth/signup/complete — step 2 submitted, activate the account.
router.post(
  '/signup/complete',
  signupLimiter,
  asyncHandler(async (req, res) => {
    const { email, code, firstName, lastName, password } = signupCompleteSchema.parse(req.body);

    const user = await completeSignup({
      email,
      code,
      // The screen asks for the two halves because that is what people expect to
      // type; the model keeps one name, and nothing in the application needs the
      // split back. Joining here beats two columns every screen would have to
      // recombine.
      name: `${firstName} ${lastName}`,
      password,
    });

    await recordAudit({
      userId: user.id,
      action: 'ACTIVATE_ACCOUNT',
      entity: 'User',
      entityId: user.id,
      ipAddress: clientIp(req),
    });

    // Signed in straight away: they proved the address seconds ago and chose the
    // password themselves, so asking them to type it again is pure friction.
    const jwtToken = jwt.sign({ sub: user.id, role: user.role }, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    });
    res.cookie(config.jwt.cookieName, jwtToken, cookieOptions());

    res.status(201).json({ user: publicUser(user) });
  })
);

// POST /api/auth/login
router.post(
  '/login',
  loginIpLimiter,
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email } });

    // Same error and comparable timing whether the user exists or not, so the
    // endpoint can't be used to enumerate valid addresses. An invited account
    // that has not set a password yet is indistinguishable from a missing one,
    // for the same reason.
    if (!user || !user.password) {
      await bcrypt.compare(password, '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva');
      throw new UnauthorizedError('INVALID_CREDENTIALS');
    }

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) throw new UnauthorizedError('INVALID_CREDENTIALS');

    // Checked after the password, so the state of an account is never disclosed
    // to someone who cannot open it.
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
