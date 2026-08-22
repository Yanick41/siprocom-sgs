'use strict';

const express = require('express');

const { z } = require('zod');

const prisma = require('../lib/prisma');
const {
  issueActivationCode,
  issuePasswordResetLink,
} = require('../services/account.service');
const { NotFoundError, ConflictError } = require('../lib/errors');
const { recordAudit, clientIp } = require('../lib/audit');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate, authorize } = require('../middleware/authenticate');
const { parseListQuery, paginated } = require('../utils/pagination');

const router = express.Router();
router.use(authenticate, authorize('ADMIN'));

const ROLES = ['ADMIN', 'MAGASINIER', 'ACHATS', 'DIRECTION'];

/** No password field: the invited person chooses their own (see POST below). */
const createUserSchema = z.object({
  name: z.string().trim().min(1).max(150),
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(ROLES),
  locale: z.enum(['fr', 'en']).default('fr'),
});

const updateUserSchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  role: z.enum(ROLES).optional(),
  isActive: z.boolean().optional(),
  locale: z.enum(['fr', 'en']).optional(),
});

const idParamSchema = z.object({ id: z.string().uuid() });

/**
 * The hash must never leave the server, not even to an admin. `pending` takes
 * its place: it is what the screen needs — has this person activated their
 * account yet — without disclosing anything about the secret itself.
 */
const publicUser = ({ password, ...user }) => ({ ...user, pending: password === null });

// GET /api/users
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = parseListQuery(req.query, { sortable: ['name', 'createdAt'], defaultSort: 'name' });

    const where = q.search
      ? {
          OR: [
            { name: { contains: q.search, mode: 'insensitive' } },
            { email: { contains: q.search, mode: 'insensitive' } },
          ],
        }
      : {};

    const [rows, total] = await Promise.all([
      prisma.user.findMany({ where, skip: q.skip, take: q.take, orderBy: q.orderBy }),
      prisma.user.count({ where }),
    ]);

    res.json(paginated(rows.map(publicUser), total, q));
  })
);

/**
 * POST /api/users — invites a colleague.
 *
 * The account is created without a password and the response carries a
 * one-time activation code. There is no email in this system: SIPROCOM is one
 * site, so the administrator reads the code out or writes it down, and the
 * colleague chooses their own password at /signup. Nobody ever types somebody
 * else's password (BR-11).
 *
 * The code is returned exactly once. It is stored only as a hash, so a lost
 * code is regenerated below, never recovered.
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = createUserSchema.parse(req.body);

    let user;
    try {
      user = await prisma.user.create({ data });
    } catch (error) {
      if (error.code === 'P2002') throw new ConflictError('EMAIL_ALREADY_REGISTERED');
      throw error;
    }

    const { code, expiresAt } = await issueActivationCode(user.email);

    await recordAudit({
      userId: req.user.id,
      action: 'INVITE_USER',
      entity: 'User',
      entityId: user.id,
      after: { email: user.email, role: user.role },
      ipAddress: clientIp(req),
    });

    res.status(201).json({ ...publicUser(user), activationCode: code, codeExpiresAt: expiresAt });
  })
);

/**
 * POST /api/users/:id/activation-code — a fresh code for a pending account.
 *
 * Replaces "resend the invitation": there is nothing to resend, so this mints a
 * new code and invalidates the last one. Used when the first code expired, was
 * mistyped five times, or was simply lost.
 */
router.post(
  '/:id/activation-code',
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundError('User', id);

    const { code, expiresAt } = await issueActivationCode(user.email);

    await recordAudit({
      userId: req.user.id,
      action: 'REISSUE_ACTIVATION_CODE',
      entity: 'User',
      entityId: id,
      ipAddress: clientIp(req),
    });

    res.json({ activationCode: code, codeExpiresAt: expiresAt });
  })
);

/**
 * POST /api/users/:id/password-reset-link — for a colleague who is locked out.
 *
 * Self-service recovery went with the email. The administrator produces a
 * one-time link instead and passes it on; the person still chooses their own
 * password, so BR-11 holds. A link rather than a code because the account
 * already exists — they land straight on "choose a new password".
 */
router.post(
  '/:id/password-reset-link',
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const { url, expiresAt } = await issuePasswordResetLink(id);

    await recordAudit({
      userId: req.user.id,
      action: 'ISSUE_PASSWORD_RESET_LINK',
      entity: 'User',
      entityId: id,
      ipAddress: clientIp(req),
    });

    res.json({ resetUrl: url, expiresAt });
  })
);
// PATCH /api/users/:id
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const data = updateUserSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('User', id);

    // Locking yourself out, or demoting yourself out of the last admin seat,
    // leaves the system with no way back in.
    if (id === req.user.id) {
      if (data.isActive === false) throw new ConflictError('CANNOT_DEACTIVATE_SELF');
      if (data.role && data.role !== 'ADMIN') throw new ConflictError('CANNOT_DEMOTE_SELF');
    }

    if ((data.isActive === false || (data.role && data.role !== 'ADMIN')) && existing.role === 'ADMIN') {
      // `password: not null` matters: an administrator who was invited but never
      // followed their link cannot sign in, so counting them as the remaining
      // admin would lock the system with nobody able to open it.
      const remainingAdmins = await prisma.user.count({
        where: { role: 'ADMIN', isActive: true, password: { not: null }, id: { not: id } },
      });
      if (remainingAdmins === 0) throw new ConflictError('LAST_ADMIN');
    }

    // No password field here any more: an administrator cannot set someone
    // else's password. If a colleague is locked out they request a reset, or
    // the admin resends an invitation — either way the secret stays theirs.
    let user;
    try {
      user = await prisma.user.update({ where: { id }, data });
    } catch (error) {
      if (error.code === 'P2002') throw new ConflictError('EMAIL_ALREADY_REGISTERED');
      throw error;
    }

    await recordAudit({
      userId: req.user.id,
      action: 'UPDATE_USER',
      entity: 'User',
      entityId: id,
      before: { email: existing.email, role: existing.role, isActive: existing.isActive },
      after: { email: user.email, role: user.role, isActive: user.isActive },
      ipAddress: clientIp(req),
    });

    res.json(publicUser(user));
  })
);

module.exports = router;
