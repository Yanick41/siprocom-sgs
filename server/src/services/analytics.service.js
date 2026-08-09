'use strict';

const prisma = require('../lib/prisma');

/**
 * Reporting and trend analysis (§4.6).
 *
 * All of it reads the movement ledger, which is indexed on
 * (productId, createdAt) and (createdAt) — no separate analytics store is
 * warranted at this data volume.
 */

const daysBetween = (from, to) => Math.max(1, Math.round((to - from) / 86_400_000));

/**
 * Products with the highest outbound volume over a period — the "produits
 * tendance" of the cahier des charges. Ranked by quantity issued, not by the
 * number of documents: one pallet leaving matters more than ten single units.
 */
async function getTrending({ from, to, limit = 10, warehouseId = null, categoryId = null }) {
  const days = daysBetween(from, to);

  const rows = await prisma.$queryRaw`
    SELECT p.id, p.reference, p.designation, p."designationEn", p.unit,
           c.name AS "categoryName",
           SUM(m.quantity)::int              AS "totalOut",
           COUNT(*)::int                     AS "movementCount",
           ROUND(SUM(m.quantity)::numeric / ${days}, 2)::float AS "avgDailyOut"
    FROM stock_movements m
    JOIN products p   ON p.id = m."productId"
    LEFT JOIN categories c ON c.id = p."categoryId"
    WHERE m.type = 'OUT'
      AND m."createdAt" >= ${from}
      AND m."createdAt" <= ${to}
      AND (${warehouseId}::text IS NULL OR m."warehouseId" = ${warehouseId})
      AND (${categoryId}::text  IS NULL OR p."categoryId"  = ${categoryId})
    GROUP BY p.id, c.name
    ORDER BY "totalOut" DESC
    LIMIT ${limit}
  `;

  return { from, to, days, items: rows };
}

/**
 * Products with little or no outbound movement over the period, and the stock
 * still sitting on them — the money tied up in slow inventory.
 * LEFT JOIN, not a filtered aggregate: products with zero movements are exactly
 * the ones being looked for, and an inner join would hide them.
 */
async function getDormant({ from, to, limit = 50, warehouseId = null }) {
  const rows = await prisma.$queryRaw`
    SELECT p.id, p.reference, p.designation, p."designationEn", p.unit,
           c.name AS "categoryName",
           COALESCE(SUM(sl.quantity), 0)::int AS "currentStock",
           COALESCE(out_movements."totalOut", 0)::int AS "totalOut",
           out_movements."lastMovement",
           (COALESCE(SUM(sl.quantity), 0) * p."buyPrice")::float AS "tiedUpValue"
    FROM products p
    LEFT JOIN categories c ON c.id = p."categoryId"
    LEFT JOIN stock_levels sl ON sl."productId" = p.id
      AND (${warehouseId}::text IS NULL OR sl."warehouseId" = ${warehouseId})
    LEFT JOIN (
      SELECT "productId", SUM(quantity)::int AS "totalOut", MAX("createdAt") AS "lastMovement"
      FROM stock_movements
      WHERE type = 'OUT' AND "createdAt" >= ${from} AND "createdAt" <= ${to}
        AND (${warehouseId}::text IS NULL OR "warehouseId" = ${warehouseId})
      GROUP BY "productId"
    ) out_movements ON out_movements."productId" = p.id
    WHERE p."isActive" = true
    GROUP BY p.id, c.name, out_movements."totalOut", out_movements."lastMovement"
    HAVING COALESCE(SUM(sl.quantity), 0) > 0
    ORDER BY COALESCE(out_movements."totalOut", 0) ASC, "tiedUpValue" DESC
    LIMIT ${limit}
  `;

  return { from, to, items: rows };
}

/** Movement totals grouped by day / category / warehouse / supplier. */
async function getMovementSummary({ from, to, groupBy = 'day', warehouseId = null }) {
  if (groupBy === 'category') {
    return prisma.$queryRaw`
      SELECT COALESCE(parent.name, c.name) AS label,
             SUM(CASE WHEN m.type = 'IN'  THEN m.quantity ELSE 0 END)::int AS "totalIn",
             SUM(CASE WHEN m.type = 'OUT' THEN m.quantity ELSE 0 END)::int AS "totalOut"
      FROM stock_movements m
      JOIN products p ON p.id = m."productId"
      JOIN categories c ON c.id = p."categoryId"
      LEFT JOIN categories parent ON parent.id = c."parentId"
      WHERE m."createdAt" >= ${from} AND m."createdAt" <= ${to}
        AND (${warehouseId}::text IS NULL OR m."warehouseId" = ${warehouseId})
      GROUP BY label
      ORDER BY "totalOut" DESC
    `;
  }

  if (groupBy === 'warehouse') {
    return prisma.$queryRaw`
      SELECT w.name AS label,
             SUM(CASE WHEN m.type = 'IN'  THEN m.quantity ELSE 0 END)::int AS "totalIn",
             SUM(CASE WHEN m.type = 'OUT' THEN m.quantity ELSE 0 END)::int AS "totalOut"
      FROM stock_movements m
      JOIN warehouses w ON w.id = m."warehouseId"
      WHERE m."createdAt" >= ${from} AND m."createdAt" <= ${to}
      GROUP BY w.name
      ORDER BY "totalOut" DESC
    `;
  }

  // Default: one row per day, for the dashboard curve.
  return prisma.$queryRaw`
    SELECT to_char(date_trunc('day', m."createdAt"), 'YYYY-MM-DD') AS label,
           SUM(CASE WHEN m.type = 'IN'  THEN m.quantity ELSE 0 END)::int AS "totalIn",
           SUM(CASE WHEN m.type = 'OUT' THEN m.quantity ELSE 0 END)::int AS "totalOut"
    FROM stock_movements m
    WHERE m."createdAt" >= ${from} AND m."createdAt" <= ${to}
      AND (${warehouseId}::text IS NULL OR m."warehouseId" = ${warehouseId})
    GROUP BY date_trunc('day', m."createdAt")
    ORDER BY date_trunc('day', m."createdAt") ASC
  `;
}

/**
 * Stock valuation at purchase price (weighted-average cost is the Q9 default;
 * revisit if SIPROCOM specifies FIFO).
 */
async function getValuation({ warehouseId = null }) {
  const rows = await prisma.$queryRaw`
    SELECT COALESCE(parent.name, c.name) AS "categoryName",
           COUNT(DISTINCT p.id)::int      AS "productCount",
           SUM(sl.quantity)::int          AS "totalQuantity",
           SUM(sl.quantity * p."buyPrice")::float  AS "buyValue",
           SUM(sl.quantity * p."sellPrice")::float AS "sellValue"
    FROM stock_levels sl
    JOIN products p ON p.id = sl."productId"
    JOIN categories c ON c.id = p."categoryId"
    LEFT JOIN categories parent ON parent.id = c."parentId"
    WHERE p."isActive" = true AND sl.quantity > 0
      AND (${warehouseId}::text IS NULL OR sl."warehouseId" = ${warehouseId})
    GROUP BY "categoryName"
    ORDER BY "buyValue" DESC
  `;

  const totals = rows.reduce(
    (acc, row) => ({
      productCount: acc.productCount + row.productCount,
      totalQuantity: acc.totalQuantity + row.totalQuantity,
      buyValue: acc.buyValue + row.buyValue,
      sellValue: acc.sellValue + row.sellValue,
    }),
    { productCount: 0, totalQuantity: 0, buyValue: 0, sellValue: 0 }
  );

  return { byCategory: rows, totals };
}

/** Single round trip powering the dashboard (§4.6, performance NFR). */
async function getDashboard({ warehouseId = null }) {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 30);

  const [
    productCount,
    warehouseCount,
    openAlerts,
    movementsToday,
    trending,
    curve,
    valuation,
    recentMovements,
  ] = await Promise.all([
    prisma.product.count({ where: { isActive: true } }),
    prisma.warehouse.count({ where: { isActive: true } }),
    prisma.alert.count({ where: { status: 'OPEN' } }),
    prisma.stockMovement.count({
      where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
    }),
    getTrending({ from, to, limit: 5, warehouseId }),
    getMovementSummary({ from, to, groupBy: 'day', warehouseId }),
    getValuation({ warehouseId }),
    prisma.stockMovement.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
      include: {
        product: { select: { reference: true, designation: true, designationEn: true, unit: true } },
        warehouse: { select: { code: true, name: true } },
        user: { select: { name: true } },
      },
    }),
  ]);

  const lowStock = await prisma.$queryRaw`
    SELECT p.id, p.reference, p.designation, p."designationEn", p.unit,
           p."minThreshold", w.name AS "warehouseName", sl.quantity
    FROM stock_levels sl
    JOIN products p ON p.id = sl."productId"
    JOIN warehouses w ON w.id = sl."warehouseId"
    WHERE p."isActive" = true AND sl.quantity < p."minThreshold"
      AND (${warehouseId}::text IS NULL OR sl."warehouseId" = ${warehouseId})
    ORDER BY (sl.quantity::float / NULLIF(p."minThreshold", 0)) ASC
    LIMIT 10
  `;

  return {
    period: { from, to },
    kpis: {
      productCount,
      warehouseCount,
      openAlerts,
      movementsToday,
      stockValue: valuation.totals.buyValue,
      totalQuantity: valuation.totals.totalQuantity,
    },
    trending: trending.items,
    curve,
    lowStock,
    recentMovements,
  };
}

module.exports = { getTrending, getDormant, getMovementSummary, getValuation, getDashboard };
