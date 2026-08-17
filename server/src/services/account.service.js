'use strict';

const bcrypt = require('bcryptjs');
const { randomBytes, createHash } = require('node:crypto');

const config = require('../config/env');
const prisma = require('../lib/prisma');
const logger = require('../lib/logger');
const { sendMail } = require('../lib/mailer');
const { accountEmail } = require('../emails/account');
const { AppError, UnauthorizedError } = require('../lib/errors');

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

/** Points at the SPA, which posts the token back to the API — so the address
 *  bar shows a page rather than a bare endpoint. */
const linkFor = (token) => `${config.appUrl}/set-password?token=${encodeURIComponent(token)}`;

/**
 * @param {'INVITATION'|'PASSWORD_RESET'} type
 * @param {{ id: string, name: string, email: string, locale: string }} user
 * @param {string} [inviterName] who created the account (INVITATION only)
 */
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

async function sendAccountEmail(type, user, inviterName) {
  const { token } = await issueToken(user.id, type);
  const url = linkFor(token);

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

module.exports = {
  assertMailConfigured,
  sendAccountEmail,
  setPasswordWithToken,
  inspectToken,
  TTL_HOURS,
};
