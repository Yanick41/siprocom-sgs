'use strict';

const { InsufficientStockError, ConflictError } = require('../lib/errors');

/**
 * The stock engine. Every change to stock_levels and stock_movements in the
 * entire application goes through this module — that single rule is what makes
 * stock integrity provable rather than hopeful.
 *
 * Invariants enforced here:
 *   BR-2  an OUT can never drive a level below zero (unless explicitly overridden)
 *   BR-4  movements are append-only; corrections are new compensating movements
 *   BR-5  every movement records who made it and when
 *
 * Sign convention:
 *   IN          quantity > 0, adds
 *   OUT         quantity > 0, subtracts
 *   ADJUSTMENT  quantity is SIGNED — positive for a surplus found at inventory,
 *               negative for shrinkage. This is the one type that carries its
 *               own sign, so the ledger sum stays:
 *                 SUM(CASE WHEN type = 'OUT' THEN -quantity ELSE quantity END)
 */

/**
 * Adds stock atomically, creating the level row on first movement.
 * @returns {Promise<number>} the balance after the movement
 */
async function increment(tx, productId, warehouseId, quantity) {
  const rows = await tx.$queryRaw`
    INSERT INTO stock_levels (id, "productId", "warehouseId", quantity, "updatedAt")
    VALUES (gen_random_uuid()::text, ${productId}, ${warehouseId}, ${quantity}, NOW())
    ON CONFLICT ("productId", "warehouseId")
    DO UPDATE SET quantity = stock_levels.quantity + ${quantity}, "updatedAt" = NOW()
    RETURNING quantity
  `;
  return rows[0].quantity;
}

/**
 * Removes stock atomically, refusing to go below zero.
 *
 * The `quantity >= n` guard lives in the WHERE clause on purpose: PostgreSQL
 * re-evaluates it after taking the row lock, so two concurrent callers competing
 * for the last unit cannot both succeed. A read-then-write would let both pass.
 *
 * @returns {Promise<number>} the balance after the movement
 * @throws {InsufficientStockError} when the guard rejects the update
 */
async function decrement(tx, productId, warehouseId, quantity, { allowNegative = false } = {}) {
  if (allowNegative) {
    // BR-3: privileged override. Still atomic, just without the floor.
    const rows = await tx.$queryRaw`
      INSERT INTO stock_levels (id, "productId", "warehouseId", quantity, "updatedAt")
      VALUES (gen_random_uuid()::text, ${productId}, ${warehouseId}, ${-quantity}, NOW())
      ON CONFLICT ("productId", "warehouseId")
      DO UPDATE SET quantity = stock_levels.quantity - ${quantity}, "updatedAt" = NOW()
      RETURNING quantity
    `;
    return rows[0].quantity;
  }

  const rows = await tx.$queryRaw`
    UPDATE stock_levels
    SET quantity = quantity - ${quantity}, "updatedAt" = NOW()
    WHERE "productId" = ${productId}
      AND "warehouseId" = ${warehouseId}
      AND quantity >= ${quantity}
    RETURNING quantity
  `;

  if (rows.length === 0) {
    // Either the level row is missing or it held too little. Read the actual
    // figure so the client can show "3 available" rather than a bare refusal.
    const existing = await tx.stockLevel.findUnique({
      where: { productId_warehouseId: { productId, warehouseId } },
      select: { quantity: true },
    });
    throw new InsufficientStockError({
      productId,
      warehouseId,
      requested: quantity,
      available: existing?.quantity ?? 0,
    });
  }

  return rows[0].quantity;
}

/**
 * Applies one movement: updates the level and appends the ledger entry.
 * MUST be called inside a prisma.$transaction.
 *
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {object} params
 * @param {'IN'|'OUT'|'ADJUSTMENT'} params.type
 * @param {number} params.quantity  positive for IN/OUT; signed for ADJUSTMENT
 * @param {string} params.userId    required — there is no anonymous movement (BR-5)
 */
async function applyMovement(
  tx,
  {
    type,
    productId,
    warehouseId,
    quantity,
    unitCost = null,
    lotNumber = null,
    reason = null,
    refType = null,
    refId = null,
    userId,
    createdAt = undefined,
    allowNegative = false,
  }
) {
  if (!userId) throw new Error('applyMovement requires userId (BR-5)');
  if (!Number.isInteger(quantity)) throw new ConflictError('QUANTITY_MUST_BE_INTEGER');

  let balanceAfter;

  if (type === 'IN') {
    if (quantity <= 0) throw new ConflictError('QUANTITY_MUST_BE_POSITIVE');
    balanceAfter = await increment(tx, productId, warehouseId, quantity);
  } else if (type === 'OUT') {
    if (quantity <= 0) throw new ConflictError('QUANTITY_MUST_BE_POSITIVE');
    balanceAfter = await decrement(tx, productId, warehouseId, quantity, { allowNegative });
  } else if (type === 'ADJUSTMENT') {
    if (quantity === 0) throw new ConflictError('QUANTITY_MUST_NOT_BE_ZERO');
    balanceAfter =
      quantity > 0
        ? await increment(tx, productId, warehouseId, quantity)
        : await decrement(tx, productId, warehouseId, -quantity, { allowNegative });
  } else {
    throw new Error(`Unknown movement type: ${type}`);
  }

  const movement = await tx.stockMovement.create({
    data: {
      type,
      productId,
      warehouseId,
      quantity,
      balanceAfter,
      unitCost,
      lotNumber,
      reason,
      refType,
      refId,
      userId,
      ...(createdAt ? { createdAt } : {}),
    },
  });

  return { movement, balanceAfter };
}

/**
 * Applies several movements in order within one transaction.
 * If any line fails, the whole document fails — a half-posted receipt would
 * leave the ledger describing goods that were never received.
 */
async function applyMovements(tx, movements) {
  const results = [];
  for (const movement of movements) {
    results.push(await applyMovement(tx, movement));
  }
  return results;
}

/**
 * Recomputes levels from the ledger and reports any divergence.
 * The materialised StockLevel table is fast to read but only trustworthy if it
 * can be proved against the append-only ledger — this is that proof.
 */
async function reconcile(prisma) {
  const rows = await prisma.$queryRaw`
    WITH ledger AS (
      SELECT "productId", "warehouseId",
             SUM(CASE WHEN type = 'OUT' THEN -quantity ELSE quantity END)::int AS computed
      FROM stock_movements
      GROUP BY "productId", "warehouseId"
    )
    SELECT
      COALESCE(sl."productId", l."productId")     AS "productId",
      COALESCE(sl."warehouseId", l."warehouseId") AS "warehouseId",
      COALESCE(sl.quantity, 0)                    AS stored,
      COALESCE(l.computed, 0)                     AS computed,
      p.reference, p.designation, w.code AS "warehouseCode"
    FROM stock_levels sl
    FULL OUTER JOIN ledger l
      ON l."productId" = sl."productId" AND l."warehouseId" = sl."warehouseId"
    LEFT JOIN products p   ON p.id = COALESCE(sl."productId", l."productId")
    LEFT JOIN warehouses w ON w.id = COALESCE(sl."warehouseId", l."warehouseId")
    WHERE COALESCE(sl.quantity, 0) <> COALESCE(l.computed, 0)
  `;

  const [{ count }] = await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM stock_levels`;

  return {
    checked: count,
    drifted: rows.length,
    consistent: rows.length === 0,
    discrepancies: rows.map((r) => ({ ...r, delta: r.stored - r.computed })),
  };
}

module.exports = { applyMovement, applyMovements, reconcile, increment, decrement };
