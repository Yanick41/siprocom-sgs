'use strict';

const bcrypt = require('bcryptjs');
const { randomBytes, randomInt, createHash } = require('node:crypto');

const config = require('../config/env');
const prisma = require('../lib/prisma');
const logger = require('../lib/logger');
const { sendMail } = require('../lib/mailer');
const { accountEmail, signupCodeEmail } = require('../emails/account');
const {
  AppError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
} = require('../lib/errors');

/**
 * Account lifecycle: invitation and password reset.
 *
 * Both are the same operation seen from two sides — prove you control the
 * address, then choose a password — so they share one token table and one
 * consuming function. Only the email wording and the expiry differ.
 */

// An invitation waits for someone to come back from leave; a reset answers a
// person standing at the screen right now. The shorter window is the one that
// costs nothing to re-request.
const TTL_HOURS = { INVITATION: 7 * 24, PASSWORD_RESET: 2 };

/**
 * SHA-256, not bcrypt: the token is 256 bits from a CSPRNG, so it is not
 * guessable and needs no work factor — only protection against a leaked dump.
 */
const hashToken = (token) => createHash('sha256').update(token).digest('hex');

/**
 * Issues a link and invalidates any earlier one of the same kind.
 *
 * Superseding matters: someone who clicks "resend" twice would otherwise hold
 * two live links, and the older mail is exactly the one likelier to have been
 * forwarded or left open in a shared inbox.
 */
async function issueToken(userId, type) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + TTL_HOURS[type] * 60 * 60 * 1000);

  await prisma.$transaction([
    prisma.accountToken.updateMany({
      where: { userId, type, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.accountToken.create({
      data: { userId, type, tokenHash: hashToken(token), expiresAt },
    }),
  ]);

  return { token, expiresAt };
}

/**
 * Points at the SPA, which posts the token back to the API — so the address bar
 * shows a page rather than a bare endpoint.
 *
 * An invitation lands on /signup, where the person fills in their own name and
 * password before confirming a code; a reset lands on /set-password, which only
 * asks for the password. Same token, two destinations, because the two arrivals
 * genuinely need different forms.
 */
const linkFor = (token, type, email) =>
  type === 'INVITATION'
    ? `${config.appUrl}/signup?email=${encodeURIComponent(email)}`
    : `${config.appUrl}/set-password?token=${encodeURIComponent(token)}`;

/**
 * Refuses an operation that depends on mail when mail cannot be sent.
 *
 * Call it *before* the work, not after: an account created with an invitation
 * nobody receives is worse than no account, because the administrator believes
 * access has been handed over and the address is now taken.
 *
 * Development is exempt — the logged link is a genuine way to test the flow.
 *
 * @throws {AppError} MAIL_NOT_CONFIGURED
 */
function assertMailConfigured() {
  if (!config.mail.enabled && config.isProduction) {
    throw new AppError('MAIL_NOT_CONFIGURED', 503);
  }
}

/**
 * @param {'INVITATION'|'PASSWORD_RESET'} type
 * @param {{ id: string, name: string, email: string, locale: string }} user
 * @param {string} [inviterName] who created the account (INVITATION only)
 */
async function sendAccountEmail(type, user, inviterName) {
  const { token } = await issueToken(user.id, type);
  const url = linkFor(token, type, user.email);

  const { subject, html, text } = accountEmail({
    type,
    locale: user.locale,
    name: user.name,
    inviter: inviterName,
    url,
    expiresInHours: TTL_HOURS[type],
  });

  const { delivered } = await sendMail({ to: user.email, subject, html, text });
  if (!delivered) logger.warn({ email: user.email, url }, `${type} link (email delivery disabled)`);

  return { delivered };
}

/**
 * Consumes a token and sets the password.
 *
 * The row is claimed with a conditional update rather than read-then-write, so
 * two clicks in quick succession cannot both go through. Setting the password
 * also reactivates the account: an invitation is only sent to someone who is
 * meant to have access.
 *
 * @throws {UnauthorizedError} INVALID_TOKEN | TOKEN_EXPIRED
 */
async function setPasswordWithToken(token, password) {
  const record = await prisma.accountToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, isActive: true } } },
  });

  if (!record || record.usedAt) throw new UnauthorizedError('INVALID_TOKEN');
  if (record.expiresAt < new Date()) throw new UnauthorizedError('TOKEN_EXPIRED');

  const claimed = await prisma.accountToken.updateMany({
    where: { id: record.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (claimed.count === 0) throw new UnauthorizedError('INVALID_TOKEN');

  const passwordHash = await bcrypt.hash(password, config.bcryptRounds);

  const user = await prisma.user.update({
    where: { id: record.userId },
    data: { password: passwordHash },
  });

  return { user, type: record.type };
}

/**
 * Checks a token without spending it, so the screen can show "this link has
 * expired" instead of a form that will fail on submit.
 */
async function inspectToken(token) {
  const record = await prisma.accountToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { name: true, email: true } } },
  });

  if (!record || record.usedAt) return { valid: false, reason: 'INVALID_TOKEN' };
  if (record.expiresAt < new Date()) return { valid: false, reason: 'TOKEN_EXPIRED' };

  return { valid: true, type: record.type, name: record.user.name, email: record.user.email };
}


// ---------------------------------------------------------------- signup codes

/** How many wrong guesses a code survives before it is burned. */
const MAX_CODE_ATTEMPTS = 5;

/** Short on purpose: the code is weak, so its lifetime carries part of the load. */
const CODE_TTL_MINUTES = 10;

/**
 * Six digits, uniformly distributed.
 *
 * randomInt, not Math.random(): the code is a credential, and a predictable
 * generator would let an attacker skip the guessing entirely. Leading zeros are
 * kept — "007431" is a valid code, and trimming it would quietly shrink the
 * space by a tenth.
 */
const generateCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');

/**
 * Issues a signup code for an invited account and emails it.
 *
 * Supersedes any earlier unused invitation, so a second "resend" leaves exactly
 * one live code — the older mail is the one likelier to be sitting in a shared
 * inbox.
 *
 * @throws {AppError}          MAIL_NOT_CONFIGURED
 * @throws {NotFoundError}     no invitation for this address
 * @throws {ConflictError}     the account is already activated
 */
async function sendSignupCode(email) {
  assertMailConfigured();

  const user = await prisma.user.findUnique({ where: { email } });

  // Deliberately explicit, unlike /login and /forgot-password. This screen is
  // only reachable by someone an administrator already invited, and telling a
  // stranger "no invitation for this address" reveals far less than leaving an
  // invited colleague staring at a form that silently refuses them.
  if (!user) throw new NotFoundError('Invitation', email);
  if (user.password) throw new ConflictError('ACCOUNT_ALREADY_ACTIVATED');
  if (!user.isActive) throw new ForbiddenError('ACCOUNT_DISABLED');

  const code = generateCode();
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);

  await prisma.$transaction([
    prisma.accountToken.updateMany({
      where: { userId: user.id, type: 'INVITATION', usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.accountToken.create({
      data: {
        userId: user.id,
        type: 'INVITATION',
        tokenHash: hashToken(token),
        codeHash: hashToken(code),
        expiresAt,
      },
    }),
  ]);

  const { subject, html, text } = signupCodeEmail({
    locale: user.locale,
    code,
    expiresInMinutes: CODE_TTL_MINUTES,
  });

  const { delivered } = await sendMail({ to: user.email, subject, html, text });
  if (!delivered) logger.warn({ email: user.email, code }, 'Signup code (email delivery disabled)');

  return { delivered, expiresAt };
}

/**
 * Checks the code and completes the account in one step.
 *
 * Name and password arrive together with the code rather than being stored
 * between the two screens: a half-finished account sitting in the database with
 * a password and no verified address is exactly the state this flow exists to
 * avoid. Nothing is written until the code is proved.
 *
 * @throws {UnauthorizedError} INVALID_CODE | CODE_EXPIRED | TOO_MANY_CODE_ATTEMPTS
 */
async function completeSignup({ email, code, name, password }) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new UnauthorizedError('INVALID_CODE');
  if (user.password) throw new ConflictError('ACCOUNT_ALREADY_ACTIVATED');
  if (!user.isActive) throw new ForbiddenError('ACCOUNT_DISABLED');

  const record = await prisma.accountToken.findFirst({
    where: { userId: user.id, type: 'INVITATION', usedAt: null, codeHash: { not: null } },
    orderBy: { createdAt: 'desc' },
  });

  if (!record) throw new UnauthorizedError('INVALID_CODE');
  if (record.expiresAt < new Date()) throw new UnauthorizedError('CODE_EXPIRED');
  if (record.attempts >= MAX_CODE_ATTEMPTS) throw new UnauthorizedError('TOO_MANY_CODE_ATTEMPTS');

  if (record.codeHash !== hashToken(code)) {
    // Counted before the answer goes out, so a client that gives up mid-request
    // still pays for the guess.
    const { count } = await prisma.accountToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { attempts: { increment: 1 } },
    });
    if (count === 0) throw new UnauthorizedError('INVALID_CODE');

    throw new UnauthorizedError(
      record.attempts + 1 >= MAX_CODE_ATTEMPTS ? 'TOO_MANY_CODE_ATTEMPTS' : 'INVALID_CODE'
    );
  }

  // Claimed conditionally rather than read-then-write, so two submissions
  // racing each other cannot both complete the account.
  const claimed = await prisma.accountToken.updateMany({
    where: { id: record.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (claimed.count === 0) throw new UnauthorizedError('INVALID_CODE');

  const passwordHash = await bcrypt.hash(password, config.bcryptRounds);

  return prisma.user.update({
    where: { id: user.id },
    data: { name, password: passwordHash },
  });
}

module.exports = {
  assertMailConfigured,
  sendAccountEmail,
  sendSignupCode,
  completeSignup,
  CODE_TTL_MINUTES,
  setPasswordWithToken,
  inspectToken,
  TTL_HOURS,
};
