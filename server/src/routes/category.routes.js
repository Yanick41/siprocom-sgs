'use strict';

const express = require('express');
const prisma = require('../lib/prisma');
const { NotFoundError, ConflictError } = require('../lib/errors');
const { recordAudit, clientIp } = require('../lib/audit');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate, authorize } = require('../middleware/authenticate');
const {
  createCategorySchema,
  updateCategorySchema,
  idParamSchema,
} = require('../validators/reference.validator');

const router = express.Router();
router.use(authenticate);

/** Builds a nested tree from the flat category list. */
const buildTree = (categories) => {
  const byId = new Map(categories.map((c) => [c.id, { ...c, children: [] }]));
  const roots = [];
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) byId.get(node.parentId).children.push(node);
    else roots.push(node);
  }
  return roots;
};

// GET /api/categories?tree=1
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const categories = await prisma.category.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { products: true } } },
    });

    res.json(req.query.tree === '1' ? { items: buildTree(categories) } : { items: categories });
  })
);

// GET /api/categories/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const category = await prisma.category.findUnique({
      where: { id },
      include: { parent: true, children: true, _count: { select: { products: true } } },
    });
    if (!category) throw new NotFoundError('Category', id);
    res.json(category);
  })
);

// POST /api/categories
router.post(
  '/',
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const data = createCategorySchema.parse(req.body);

    if (data.parentId) {
      const parent = await prisma.category.findUnique({ where: { id: data.parentId } });
      if (!parent) throw new NotFoundError('Category', data.parentId);
      // The cahier des charges specifies categories and sub-categories — one
      // level of nesting. Deeper trees would break the reporting group-bys.
      if (parent.parentId) throw new ConflictError('MAX_CATEGORY_DEPTH_EXCEEDED');
    }

    const category = await prisma.category.create({ data });

    await recordAudit({
      userId: req.user.id,
      action: 'CREATE_CATEGORY',
      entity: 'Category',
      entityId: category.id,
      after: category,
      ipAddress: clientIp(req),
    });

    res.status(201).json(category);
  })
);

// PATCH /api/categories/:id
router.patch(
  '/:id',
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const data = updateCategorySchema.parse(req.body);

    const existing = await prisma.category.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Category', id);

    if (data.parentId) {
      if (data.parentId === id) throw new ConflictError('CATEGORY_CANNOT_BE_ITS_OWN_PARENT');
      const parent = await prisma.category.findUnique({ where: { id: data.parentId } });
      if (!parent) throw new NotFoundError('Category', data.parentId);
      if (parent.parentId) throw new ConflictError('MAX_CATEGORY_DEPTH_EXCEEDED');
    }

    const category = await prisma.category.update({ where: { id }, data });

    await recordAudit({
      userId: req.user.id,
      action: 'UPDATE_CATEGORY',
      entity: 'Category',
      entityId: id,
      before: existing,
      after: category,
      ipAddress: clientIp(req),
    });

    res.json(category);
  })
);

// DELETE /api/categories/:id
router.delete(
  '/:id',
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);

    const category = await prisma.category.findUnique({
      where: { id },
      include: { _count: { select: { products: true, children: true } } },
    });
    if (!category) throw new NotFoundError('Category', id);

    // Categories have no isActive flag, so deletion is real — refuse it while
    // anything still points here rather than orphaning products.
    if (category._count.products > 0) {
      throw new ConflictError('CATEGORY_HAS_PRODUCTS', { count: category._count.products });
    }
    if (category._count.children > 0) {
      throw new ConflictError('CATEGORY_HAS_CHILDREN', { count: category._count.children });
    }

    await prisma.category.delete({ where: { id } });

    await recordAudit({
      userId: req.user.id,
      action: 'DELETE_CATEGORY',
      entity: 'Category',
      entityId: id,
      before: category,
      ipAddress: clientIp(req),
    });

    res.status(204).end();
  })
);

module.exports = router;
