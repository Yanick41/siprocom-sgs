'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');

const prisma = require('../lib/prisma');
const config = require('../config/env');
const { NotFoundError, ConflictError } = require('../lib/errors');
const { recordAudit, clientIp } = require('../lib/audit');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate, authorize } = require('../middleware/authenticate');
const { parseListQuery, paginated } = require('../utils/pagination');

const router = express.Router();
router.use(authenticate, authorize('ADMIN'));

const ROLES = ['ADMIN', 'MAGASINIER', 'ACHATS', 'DIRECTION'];

const createUserSchema = z.object({
  name: z.string().trim().min(1).max(150),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, 'PASSWORD_TOO_SHORT').max(200),
  role: z.enum(ROLES),
  locale: z.enum(['fr', 'en']).default('fr'),
});

const updateUserSchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  role: z.enum(ROLES).optional(),
  isActive: z.boolean().optional(),
  locale: z.enum(['fr', 'en']).optional(),
  password: z.string().min(8, 'PASSWORD_TOO_SHORT').max(200).optional(),
});

const idParamSchema = z.object({ id: z.string().uuid() });

/** The hash must never leave the server, not even to an admin. */
// eslint-disable-next-line no-unused-vars -- destructured purely to drop it
const publicUser = ({ password: _hash, ...user }) => user;

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

// POST /api/users
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = createUserSchema.parse(req.body);
    const password = await bcrypt.hash(data.password, config.bcryptRounds);

    const user = await prisma.user.create({ data: { ...data, password } });

    await recordAudit({
      userId: req.user.id,
      action: 'CREATE_USER',
      entity: 'User',
      entityId: user.id,
      after: { email: user.email, role: user.role },
      ipAddress: clientIp(req),
    });

    res.status(201).json(publicUser(user));
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
      const remainingAdmins = await prisma.user.count({
        where: { role: 'ADMIN', isActive: true, id: { not: id } },
      });
      if (remainingAdmins === 0) throw new ConflictError('LAST_ADMIN');
    }

    if (data.password) data.password = await bcrypt.hash(data.password, config.bcryptRounds);

    const user = await prisma.user.update({ where: { id }, data });

    await recordAudit({
      userId: req.user.id,
      action: data.password ? 'RESET_USER_PASSWORD' : 'UPDATE_USER',
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
