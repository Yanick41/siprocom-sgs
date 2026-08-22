'use strict';

const bcrypt = require('bcryptjs');
const { randomBytes, randomInt, createHash } = require('node:crypto');

const config = require('../config/env');
const prisma = require('../lib/prisma');
const { UnauthorizedError, ForbiddenError, NotFoundError, ConflictError } = require('../lib/errors');

/**
 * Account lifecycle: activation and password recovery, without email.
 *
 * SIPROCOM runs one site and the administrator sits with the team, so a code
 * read out across the room reaches its recipient faster and more reliably than
 * a message that depends on a mail provider, a verified sending domain and a
 * spam filter. The whole email path was removed for that reason: it was one
 * more thing to configure, and configuring it wrong locked people out silently.
 *
 * What this costs, stated plainly: the administrator now sees the code, so they
 * *could* activate a colleague's account and post movements under that name.
 * They already control roles and can deactivate anyone, so it is no escalation
 * of power — but attribution (BR-5) is weaker than it was, and that is the
 * trade the no-email arrangement makes.
 *
 * What it does not cost: BR-11 still holds. The administrator hands over a
 * one-time code, never a password. The colleague chooses their own.
 */

// An invitation waits for someone to come back from leave; a reset answers a
// person standing at the screen right now.
const TTL_HOURS = { INVITATION: 7 * 24, PASSWORD_RESET: 2 };

/** How many wrong guesses a code survives before it is burned. */
const MAX_CODE_ATTEMPTS = 5;

/**
 * Longer than the ten minutes an emailed code would get.
 *
 * The threat model changed with the delivery: nothing sits in an inbox waiting
 * to be read, so the short window bought little — while an administrator who
 * reads out a code and is then pulled away needs it to still work when they
 * come back.
 */
const CODE_TTL_MINUTES = 60;

/**
 * SHA-256. For the 256-bit link token this is real protection; for six digits
 * it only keeps the value out of plain sight in backups and logs — a million
 * combinations is a lookup table an attacker builds in seconds. What actually
 * guards the code is `attempts` plus the expiry.
 */
const hashValue = (value) => createHash('sha256').update(value).digest('hex');

/**
 * Six digits, uniformly distributed.
 *
 * randomInt, not Math.random(): the code is a credential, and a predictable
 * generator would let an attacker skip the guessing entirely. Leading zeros are
 * kept — "007431" is valid, and trimming it would quietly shrink the space.
 */
const generateCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');

/**
 * Issues an activation code for an invited account and returns it in clear.
 *
 * Returning the code is the point: there is no inbox to deliver it to, so the
 * administrator reads it off the screen. This is the only moment the value
 * exists in readable form — the database keeps a hash — so a lost code is
 * regenerated, never recovered.
 *
 * Supersedes any earlier unused invitation, so exactly one code is ever live.
 *
 * @throws {NotFoundError} no invitation for this address
 * @throws {ConflictError} the account is already activated
 */
async function issueActivationCode(email) {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) throw new NotFoundError('Invitation', email);
  if (user.password) throw new ConflictError('ACCOUNT_ALREADY_ACTIVATED');
  if (!user.isActive) throw new ForbiddenError('ACCOUNT_DISABLED');

  const code = generateCode();
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
        // The link token goes unused in this flow, but the column is unique and
        // required; a random value keeps the row well-formed without inventing
        // a second code path nobody walks.
        tokenHash: hashValue(randomBytes(32).toString('base64url')),
        codeHash: hashValue(code),
        expiresAt,
      },
    }),
  ]);

  return { code, expiresAt, name: user.name, email: user.email };
}

/**
 * Issues a password-reset link for an existing account and returns the URL.
 *
 * A link rather than a code here: the person already has an account and a name,
 * so they land straight on "choose a new password" instead of re-running the
 * signup form.
 *
 * @throws {NotFoundError} unknown account
 * @throws {ConflictError} the account was never activated — invite it instead
 */
async function issuePasswordResetLink(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user) throw new NotFoundError('User', userId);
  if (!user.password) throw new ConflictError('ACCOUNT_NOT_ACTIVATED');
  if (!user.isActive) throw new ForbiddenError('ACCOUNT_DISABLED');

  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + TTL_HOURS.PASSWORD_RESET * 60 * 60 * 1000);

  await prisma.$transaction([
    prisma.accountToken.updateMany({
      where: { userId: user.id, type: 'PASSWORD_RESET', usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.accountToken.create({
      data: { userId: user.id, type: 'PASSWORD_RESET', tokenHash: hashValue(token), expiresAt },
    }),
  ]);

  return {
    url: `${config.appUrl}/set-password?token=${encodeURIComponent(token)}`,
    expiresAt,
  };
}

/**
 * Consumes a reset link and sets the password.
 *
 * The row is claimed with a conditional update rather than read-then-write, so
 * two clicks in quick succession cannot both go through.
 *
 * @throws {UnauthorizedError} INVALID_TOKEN | TOKEN_EXPIRED
 */
async function setPasswordWithToken(token, password) {
  const record = await prisma.accountToken.findUnique({
    where: { tokenHash: hashValue(token) },
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
 * Checks a link without spending it, so the screen can show "this link has
 * expired" instead of a form that will fail on submit.
 */
async function inspectToken(token) {
  const record = await prisma.accountToken.findUnique({
    where: { tokenHash: hashValue(token) },
    include: { user: { select: { name: true, email: true } } },
  });

  if (!record || record.usedAt) return { valid: false, reason: 'INVALID_TOKEN' };
  if (record.expiresAt < new Date()) return { valid: false, reason: 'TOKEN_EXPIRED' };

  return { valid: true, type: record.type, name: record.user.name, email: record.user.email };
}

/**
 * Checks the activation code and completes the account in one step.
 *
 * Name and password arrive with the code rather than being stored between the
 * two screens: a half-finished account holding a password and an unproved
 * address is exactly the state this flow exists to avoid. Nothing is written
 * until the code is proved.
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

  if (record.codeHash !== hashValue(code)) {
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
  issueActivationCode,
  issuePasswordResetLink,
  setPasswordWithToken,
  inspectToken,
  completeSignup,
  CODE_TTL_MINUTES,
};
