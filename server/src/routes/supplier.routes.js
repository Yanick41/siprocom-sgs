'use strict';

const express = require('express');
const prisma = require('../lib/prisma');
const { NotFoundError, ConflictError } = require('../lib/errors');
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
// Filters: search, status (active|inactive|all). `status` rather than the
// `includeInactive=1` flag this used to take, so the parameter reads the same
// way as it does on /api/products; nothing was calling the old flag.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = parseListQuery(req.query, { sortable: SORTABLE, defaultSort: 'name' });
    const { status = 'active' } = req.query;

    const where = {
      ...(status === 'all' ? {} : { isActive: status !== 'inactive' }),
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

// PATCH /api/suppliers/:id/deactivate - soft delete, keeps historical receipts intact.
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

// DELETE /api/suppliers/:id - permanent, and only for a supplier nothing points at.
//
// Refused the moment anything references it, because the schema would not
// refuse: ProductSupplier cascades, so the links would disappear, and
// GoodsReceipt.supplierId is optional with no action declared, so Prisma sets
// it null and years of purchase documents quietly forget who supplied them.
// Neither failure announces itself, which is the whole reason rule 8 says
// soft-delete for anything referenced.
//
// So this is the mistake-eraser: a supplier typed in wrongly ten minutes ago.
// Anything with history is deactivated instead, and the error says so.
router.delete(
  '/:id',
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);

    const supplier = await prisma.supplier.findUnique({
      where: { id },
      include: { _count: { select: { products: true, receipts: true } } },
    });
    if (!supplier) throw new NotFoundError('Supplier', id);

    if (supplier._count.receipts > 0) {
      throw new ConflictError('SUPPLIER_HAS_RECEIPTS', { count: supplier._count.receipts });
    }
    if (supplier._count.products > 0) {
      throw new ConflictError('SUPPLIER_HAS_PRODUCTS', { count: supplier._count.products });
    }

    await prisma.supplier.delete({ where: { id } });

    await recordAudit({
      userId: req.user.id,
      action: 'DELETE_SUPPLIER',
      entity: 'Supplier',
      entityId: id,
      before: supplier,
      ipAddress: clientIp(req),
    });

    res.status(204).end();
  })
);

// PATCH /api/suppliers/:id/activate - undoes a deactivation.
// Without this a supplier switched off by mistake could only be brought back
// through the database, which is not a repair anyone should have to perform.
router.patch(
  '/:id/activate',
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const existing = await prisma.supplier.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Supplier', id);

    const supplier = await prisma.supplier.update({ where: { id }, data: { isActive: true } });

    await recordAudit({
      userId: req.user.id,
      action: 'ACTIVATE_SUPPLIER',
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
