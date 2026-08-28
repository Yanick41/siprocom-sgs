'use strict';

const express = require('express');
const prisma = require('../lib/prisma');
const { NotFoundError, ConflictError, ForbiddenError } = require('../lib/errors');
const { recordAudit, clientIp } = require('../lib/audit');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate, authorize } = require('../middleware/authenticate');
const { parseListQuery, paginated } = require('../utils/pagination');
const { applyMovements } = require('../services/stock.service');
const { allocateNumber } = require('../services/counter.service');
const { checkThresholdsAsync } = require('../services/alert.service');
const { resolveIssueLine } = require('../services/packaging.service');
const { createOnce } = require('../lib/idempotency');

/** Products whose level moved, and therefore whose thresholds must be re-checked. */
const affectedProducts = (doc) => doc.lines.map((line) => line.productId);
const {
  createIssueSchema,
  updateIssueSchema,
  validateDocSchema,
  cancelDocSchema,
  idParamSchema,
} = require('../validators/stock.validator');

const router = express.Router();
router.use(authenticate);

const DOC_INCLUDE = {
  createdBy: { select: { id: true, name: true } },
  validatedBy: { select: { id: true, name: true } },
  deliveredBy: { select: { id: true, name: true } },
  invoice: {
    select: {
      id: true,
      number: true,
      createdAt: true,
      createdBy: { select: { id: true, name: true } },
    },
  },
  lines: {
    include: {
      product: {
        select: {
          id: true, reference: true, designation: true, designationEn: true,
          unit: true, unitsPerCarton: true, sellPrice: true, cartonSellPrice: true,
        },
      },
    },
  },
};

// GET /api/issues
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = parseListQuery(req.query, {
      sortable: ['issueDate', 'number', 'createdAt'],
      defaultSort: 'issueDate',
    });
    const { status, reason, from, to } = req.query;

    const where = {
      ...(status ? { status } : {}),
      ...(reason ? { reason } : {}),
      ...(from || to
        ? { issueDate: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
        : {}),
      ...(q.search ? { number: { contains: q.search, mode: 'insensitive' } } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.goodsIssue.findMany({
        where,
        skip: q.skip,
        take: q.take,
        orderBy: q.orderBy,
        include: {
          createdBy: { select: { id: true, name: true } },
          _count: { select: { lines: true } },
        },
      }),
      prisma.goodsIssue.count({ where }),
    ]);

    res.json(paginated(items, total, q));
  })
);

/**
 * Customers seen on past issues: GET /api/issues/customers
 *
 * Derived from the documents themselves rather than kept in a Customer table.
 * A shop sells to walk-ins as often as to regulars, and a table would mean a
 * record for every one of them - while the documents already hold the answer.
 *
 * Most recent details win: a customer who moved should not be offered the old
 * address. Declared before /:id so "customers" is not read as an id.
 */
router.get(
  '/customers',
  asyncHandler(async (req, res) => {
    const rows = await prisma.$queryRaw`
      SELECT DISTINCT ON (lower(recipient))
             recipient,
             "recipientPhone" AS phone,
             "recipientAddress" AS address
      FROM goods_issues
      WHERE recipient IS NOT NULL AND btrim(recipient) <> ''
      ORDER BY lower(recipient), "issueDate" DESC
      LIMIT 500
    `;
    res.json({ items: rows });
  })
);

// GET /api/issues/:id
// Drafts also report live availability per line so the UI can warn before validation.
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const issue = await prisma.goodsIssue.findUnique({ where: { id }, include: DOC_INCLUDE });
    if (!issue) throw new NotFoundError('GoodsIssue', id);

    if (issue.status === 'DRAFT') {
      const levels = await prisma.stockLevel.findMany({
        where: { productId: { in: issue.lines.map((l) => l.productId) } },
        select: { productId: true, quantity: true },
      });
      const available = new Map(levels.map((l) => [l.productId, l.quantity]));
      // Availability is compared against baseQuantity: 3 cartons of 12 need 36
      // bottles on the shelf, not 3.
      issue.lines = issue.lines.map((line) => ({
        ...line,
        available: available.get(line.productId) ?? 0,
        sufficient: (available.get(line.productId) ?? 0) >= line.baseQuantity,
      }));
    }

    res.json(issue);
  })
);

// POST /api/issues
router.post(
  '/',
  authorize('ADMIN', 'MAGASINIER'),
  asyncHandler(async (req, res) => {
    const { lines, id, ...data } = createIssueSchema.parse(req.body);

    // A replay of an issue this server already recorded. Answer with what
    // exists instead of allocating a second BS number for the same goods.
    if (id) {
      const already = await prisma.goodsIssue.findUnique({
        where: { id },
        include: DOC_INCLUDE,
      });
      if (already) return res.status(200).json(already);
    }

    // Conversion happens once, here, against the product's current factor and
    // price - both are then frozen on the line, so a later change to either
    // cannot rewrite what this document says.
    const products = await prisma.product.findMany({
      where: { id: { in: [...new Set(lines.map((l) => l.productId))] } },
    });
    const productById = new Map(products.map((p) => [p.id, p]));

    const resolvedLines = lines.map((line) => {
      const product = productById.get(line.productId);
      if (!product) throw new NotFoundError('Product', line.productId);
      return resolveIssueLine(product, line);
    });

    // The lookup above answers the ordinary replay. This catches the race
    // where two replays arrive together and both found nothing: the primary
    // key rejects the loser, and it gets the winner document back. The
    // counter increment rolls back with the transaction, so no BS number is
    // burned.
    const { record: issue } = await createOnce({
      id,
      find: (rowId) => prisma.goodsIssue.findUnique({ where: { id: rowId }, include: DOC_INCLUDE }),
      create: () =>
        prisma.$transaction(async (tx) => {
          const number = await allocateNumber(tx, 'ISSUE');
          return tx.goodsIssue.create({
            data: {
              ...(id ? { id } : {}),
              ...data,
              number,
              status: 'DRAFT',
              createdById: req.user.id,
              lines: { create: resolvedLines },
            },
            include: DOC_INCLUDE,
          });
        }),
    });

    await recordAudit({
      userId: req.user.id,
      action: 'CREATE_ISSUE',
      entity: 'GoodsIssue',
      entityId: issue.id,
      after: { number: issue.number, lines: lines.length },
      ipAddress: clientIp(req),
    });

    res.status(201).json(issue);
  })
);

// PATCH /api/issues/:id - drafts only.
router.patch(
  '/:id',
  authorize('ADMIN', 'MAGASINIER'),
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const { lines, ...data } = updateIssueSchema.parse(req.body);

    const existing = await prisma.goodsIssue.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('GoodsIssue', id);
    if (existing.status !== 'DRAFT') throw new ConflictError('DOCUMENT_NOT_DRAFT');

    // Edited lines are re-resolved, not stored raw: an untouched `packaging`
    // still needs its baseQuantity and price recomputed.
    let resolvedLines = null;
    if (lines) {
      const products = await prisma.product.findMany({
        where: { id: { in: [...new Set(lines.map((l) => l.productId))] } },
      });
      const productById = new Map(products.map((p) => [p.id, p]));
      resolvedLines = lines.map((line) => {
        const product = productById.get(line.productId);
        if (!product) throw new NotFoundError('Product', line.productId);
        return resolveIssueLine(product, line);
      });
    }

    const issue = await prisma.$transaction(async (tx) => {
      if (resolvedLines) {
        await tx.goodsIssueLine.deleteMany({ where: { issueId: id } });
        await tx.goodsIssueLine.createMany({
          data: resolvedLines.map((l) => ({ ...l, issueId: id })),
        });
      }
      return tx.goodsIssue.update({ where: { id }, data, include: DOC_INCLUDE });
    });

    res.json(issue);
  })
);

// POST /api/issues/:id/validate
// Enforces BR-2 (no negative stock) and BR-7 (transfers are atomic pairs).
router.post(
  '/:id/validate',
  authorize('ADMIN', 'MAGASINIER'),
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const { allowNegative = false } = validateDocSchema.parse(req.body ?? {});

    // BR-3: only an ADMIN may knowingly drive stock negative, and the override
    // is recorded in the audit trail below.
    if (allowNegative && req.user.role !== 'ADMIN') {
      throw new ForbiddenError('NEGATIVE_OVERRIDE_REQUIRES_ADMIN');
    }

    const issue = await prisma.$transaction(async (tx) => {
      const doc = await tx.goodsIssue.findUnique({ where: { id }, include: { lines: true } });
      if (!doc) throw new NotFoundError('GoodsIssue', id);
      if (doc.status === 'VALIDATED') throw new ConflictError('DOCUMENT_ALREADY_VALIDATED');
      if (doc.status === 'CANCELLED') throw new ConflictError('DOCUMENT_CANCELLED');
      if (doc.lines.length === 0) throw new ConflictError('EMPTY_DOCUMENT');

      // Leaving stock. Throws InsufficientStockError on any line.
      await applyMovements(
        tx,
        doc.lines.map((line) => ({
          type: 'OUT',
          productId: line.productId,
          quantity: line.baseQuantity,
          reason: doc.reason,
          refType: 'GoodsIssue',
          refId: doc.id,
          userId: req.user.id,
          allowNegative,
        }))
      );

      return tx.goodsIssue.update({
        where: { id },
        data: { status: 'VALIDATED', validatedAt: new Date(), validatedById: req.user.id },
        include: DOC_INCLUDE,
      });
    });

    checkThresholdsAsync(affectedProducts(issue));

    await recordAudit({
      userId: req.user.id,
      action: allowNegative ? 'VALIDATE_ISSUE_NEGATIVE_OVERRIDE' : 'VALIDATE_ISSUE',
      entity: 'GoodsIssue',
      entityId: id,
      after: { number: issue.number, lines: issue.lines.length, allowNegative },
      ipAddress: clientIp(req),
    });

    res.json(issue);
  })
);

// POST /api/issues/:id/cancel - returns the goods to stock (BR-9).
router.post(
  '/:id/cancel',
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const { reason } = cancelDocSchema.parse(req.body);

    const issue = await prisma.$transaction(async (tx) => {
      const doc = await tx.goodsIssue.findUnique({ where: { id }, include: { lines: true } });
      if (!doc) throw new NotFoundError('GoodsIssue', id);
      if (doc.status === 'CANCELLED') throw new ConflictError('DOCUMENT_CANCELLED');

      if (doc.status === 'VALIDATED') {
        await applyMovements(
          tx,
          doc.lines.map((line) => ({
            type: 'IN',
            productId: line.productId,
            quantity: line.baseQuantity,
            reason: `Annulation ${doc.number}: ${reason}`,
            refType: 'GoodsIssue',
            refId: doc.id,
            userId: req.user.id,
          }))
        );
      }

      return tx.goodsIssue.update({
        where: { id },
        data: { status: 'CANCELLED', notes: reason },
        include: DOC_INCLUDE,
      });
    });

    checkThresholdsAsync(affectedProducts(issue));

    await recordAudit({
      userId: req.user.id,
      action: 'CANCEL_ISSUE',
      entity: 'GoodsIssue',
      entityId: id,
      after: { number: issue.number, reason },
      ipAddress: clientIp(req),
    });

    res.json(issue);
  })
);

/**
 * POST /api/issues/:id/deliver - records the handover.
 *
 * Delivery is not validation. Validating deducts stock, which happens when the
 * document is committed; delivering says the goods reached the person named on
 * the bon, which can be hours or days later and is the thing a magasinier is
 * actually asked about. Only a validated document can be delivered: nothing has
 * left the shelf for a draft, and a cancelled bon describes goods that came
 * back.
 *
 * Idempotent. A second call on an already-delivered bon returns it unchanged
 * rather than rewriting the timestamp, so the record keeps saying when the
 * handover happened rather than when the button was last pressed.
 */
router.post(
  '/:id/deliver',
  authorize('ADMIN', 'MAGASINIER'),
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);

    const doc = await prisma.goodsIssue.findUnique({ where: { id } });
    if (!doc) throw new NotFoundError('GoodsIssue', id);
    if (doc.status === 'CANCELLED') throw new ConflictError('DOCUMENT_CANCELLED');
    if (doc.status !== 'VALIDATED') throw new ConflictError('DOCUMENT_NOT_VALIDATED');

    if (doc.deliveredAt) {
      const unchanged = await prisma.goodsIssue.findUnique({ where: { id }, include: DOC_INCLUDE });
      return res.json(unchanged);
    }

    const issue = await prisma.goodsIssue.update({
      where: { id },
      data: { deliveredAt: new Date(), deliveredById: req.user.id },
      include: DOC_INCLUDE,
    });

    await recordAudit({
      userId: req.user.id,
      action: 'DELIVER_ISSUE',
      entity: 'GoodsIssue',
      entityId: id,
      after: { number: issue.number, deliveredAt: issue.deliveredAt },
      ipAddress: clientIp(req),
    });

    res.json(issue);
  })
);

/**
 * POST /api/issues/:id/invoice - raises the facture for a bon de sortie.
 *
 * Only for a validated document: a draft has moved nothing, and billing a
 * customer for goods still on the shelf is the one mistake this must not
 * allow. A cancelled bon is refused for the mirror reason.
 *
 * The invoice stores no lines and no prices. Everything the printed facture
 * shows is already frozen on the issue lines, and a second copy here would be
 * free to disagree with the first.
 *
 * One per bon, and the unique index on issueId is what enforces it rather than
 * the lookup: a double-click sends two requests, both find nothing, and only
 * the constraint stops the second from burning another FA number. The loser is
 * answered with the winner's invoice.
 */
router.post(
  '/:id/invoice',
  authorize('ADMIN', 'MAGASINIER', 'ACHATS'),
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);

    const doc = await prisma.goodsIssue.findUnique({
      where: { id },
      include: { invoice: true },
    });
    if (!doc) throw new NotFoundError('GoodsIssue', id);
    if (doc.status === 'CANCELLED') throw new ConflictError('DOCUMENT_CANCELLED');
    if (doc.status !== 'VALIDATED') throw new ConflictError('DOCUMENT_NOT_VALIDATED');

    if (doc.invoice) {
      const existing = await prisma.goodsIssue.findUnique({ where: { id }, include: DOC_INCLUDE });
      return res.json(existing);
    }

    try {
      await prisma.$transaction(async (tx) => {
        const number = await allocateNumber(tx, 'INVOICE');
        return tx.invoice.create({
          data: { number, issueId: id, createdById: req.user.id },
        });
      });
    } catch (error) {
      // Someone else won the race. The FA number they allocated rolled back
      // with this transaction, so nothing is skipped in the sequence.
      if (error?.code !== 'P2002') throw error;
    }

    const issue = await prisma.goodsIssue.findUnique({ where: { id }, include: DOC_INCLUDE });

    await recordAudit({
      userId: req.user.id,
      action: 'CREATE_INVOICE',
      entity: 'Invoice',
      entityId: issue.invoice?.id,
      after: { number: issue.invoice?.number, issue: issue.number },
      ipAddress: clientIp(req),
    });

    res.status(201).json(issue);
  })
);

module.exports = router;
