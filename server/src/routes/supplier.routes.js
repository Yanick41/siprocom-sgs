'use strict';

const express = require('express');
const prisma = require('../lib/prisma');
const { NotFoundError } = require('../lib/errors');
const { recordAudit, clientIp } = require('../lib/audit');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate, authorize } = require('../middleware/authenticate');
const { parseListQuery, paginated } = require('../utils/pagination');
const {
  createSupplierSchema,
  updateSupplierSchema,
  idParamSchema,
} = require('../validators/reference.validator');

const router = express.Router();
router.use(authenticate);

const SORTABLE = ['name', 'createdAt'];

// GET /api/suppliers
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = parseListQuery(req.query, { sortable: SORTABLE, defaultSort: 'name' });

    const where = {
      ...(req.query.includeInactive === '1' ? {} : { isActive: true }),
      ...(q.search
        ? {
            OR: [
              { name: { contains: q.search, mode: 'insensitive' } },
              { contact: { contains: q.search, mode: 'insensitive' } },
              { email: { contains: q.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.supplier.findMany({
        where,
        skip: q.skip,
        take: q.take,
        orderBy: q.orderBy,
        include: { _count: { select: { products: true } } },
      }),
      prisma.supplier.count({ where }),
    ]);

    res.json(paginated(items, total, q));
  })
);

// GET /api/suppliers/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const supplier = await prisma.supplier.findUnique({
      where: { id },
      include: {
        products: { include: { product: { select: { id: true, reference: true, designation: true } } } },
      },
    });
    if (!supplier) throw new NotFoundError('Supplier', id);
    res.json(supplier);
  })
);

// POST /api/suppliers
router.post(
  '/',
  authorize('ADMIN', 'ACHATS'),
  asyncHandler(async (req, res) => {
    const data = createSupplierSchema.parse(req.body);
    if (data.email === '') data.email = null;

    const supplier = await prisma.supplier.create({ data });

    await recordAudit({
      userId: req.user.id,
      action: 'CREATE_SUPPLIER',
      entity: 'Supplier',
      entityId: supplier.id,
      after: supplier,
      ipAddress: clientIp(req),
    });

    res.status(201).json(supplier);
  })
);

// PATCH /api/suppliers/:id
router.patch(
  '/:id',
  authorize('ADMIN', 'ACHATS'),
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const data = updateSupplierSchema.parse(req.body);
    if (data.email === '') data.email = null;

    const existing = await prisma.supplier.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Supplier', id);

    const supplier = await prisma.supplier.update({ where: { id }, data });

    await recordAudit({
      userId: req.user.id,
      action: 'UPDATE_SUPPLIER',
      entity: 'Supplier',
      entityId: id,
      before: existing,
      after: supplier,
      ipAddress: clientIp(req),
    });

    res.json(supplier);
  })
);

// PATCH /api/suppliers/:id/deactivate — soft delete, keeps historical receipts intact.
router.patch(
  '/:id/deactivate',
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const existing = await prisma.supplier.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Supplier', id);

    const supplier = await prisma.supplier.update({ where: { id }, data: { isActive: false } });

    await recordAudit({
      userId: req.user.id,
      action: 'DEACTIVATE_SUPPLIER',
      entity: 'Supplier',
      entityId: id,
      before: existing,
      after: supplier,
      ipAddress: clientIp(req),
    });

    res.json(supplier);
  })
);

module.exports = router;
