'use strict';

const express = require('express');
const prisma = require('../lib/prisma');
const { NotFoundError, ConflictError } = require('../lib/errors');
const { recordAudit, clientIp } = require('../lib/audit');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate, authorize } = require('../middleware/authenticate');
const {
  createWarehouseSchema,
  updateWarehouseSchema,
  idParamSchema,
} = require('../validators/reference.validator');

const router = express.Router();
router.use(authenticate);

// GET /api/warehouses
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const where = req.query.includeInactive === '1' ? {} : { isActive: true };

    const warehouses = await prisma.warehouse.findMany({
      where,
      orderBy: { name: 'asc' },
      include: { _count: { select: { stockLevels: true } } },
    });

    res.json({ items: warehouses });
  })
);

// GET /api/warehouses/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const warehouse = await prisma.warehouse.findUnique({ where: { id } });
    if (!warehouse) throw new NotFoundError('Warehouse', id);
    res.json(warehouse);
  })
);

// POST /api/warehouses
router.post(
  '/',
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const data = createWarehouseSchema.parse(req.body);
    const warehouse = await prisma.warehouse.create({ data });

    await recordAudit({
      userId: req.user.id,
      action: 'CREATE_WAREHOUSE',
      entity: 'Warehouse',
      entityId: warehouse.id,
      after: warehouse,
      ipAddress: clientIp(req),
    });

    res.status(201).json(warehouse);
  })
);

// PATCH /api/warehouses/:id
router.patch(
  '/:id',
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const data = updateWarehouseSchema.parse(req.body);

    const existing = await prisma.warehouse.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Warehouse', id);

    // Deactivating a warehouse that still holds stock would hide that stock
    // from every total while the goods physically remain on the shelves.
    if (data.isActive === false) {
      const remaining = await prisma.stockLevel.aggregate({
        where: { warehouseId: id, quantity: { gt: 0 } },
        _count: true,
      });
      if (remaining._count > 0) {
        throw new ConflictError('WAREHOUSE_NOT_EMPTY', { products: remaining._count });
      }
    }

    const warehouse = await prisma.warehouse.update({ where: { id }, data });

    await recordAudit({
      userId: req.user.id,
      action: 'UPDATE_WAREHOUSE',
      entity: 'Warehouse',
      entityId: id,
      before: existing,
      after: warehouse,
      ipAddress: clientIp(req),
    });

    res.json(warehouse);
  })
);

module.exports = router;
