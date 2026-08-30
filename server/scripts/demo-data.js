'use strict';

/**
 * Realistic data to exercise the system with.
 *
 *   node scripts/demo-data.js            # add products + 90 days of history
 *   node scripts/demo-data.js --clear    # remove only what this script created
 *
 * Distinct from `prisma/seed.js`, which wipes every table and creates accounts
 * whose password is published in the README - fine for a scratch database,
 * wrong for one that already holds the real administrator. This script adds and
 * never deletes users, so it is safe against the working database.
 *
 * The 90 days of back-dated movements are the point: trending, dormant stock and
 * the dashboard curve have nothing to show without history, so a catalogue
 * alone would leave half the screens untestable.
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const DAYS_OF_HISTORY = 90;

/** Deterministic PRNG - a re-run produces the same figures, so a bug report is
 *  reproducible rather than "it looked different yesterday". */
let seed = 20260817;
const random = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};
const randomInt = (min, max) => Math.floor(random() * (max - min + 1)) + min;
const pick = (array) => array[Math.floor(random() * array.length)];

const daysAgo = (days) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(randomInt(7, 18), randomInt(0, 59), 0, 0);
  return date;
};

/** Marks every row this script owns, so --clear can find them again. */
const REF_PREFIX = 'DEMO-';

const SUPPLIERS = [
  { name: 'Distribution Ivoire SA', contact: 'M. Bamba', phone: '+225 07 00 11 22', email: 'contact@dist-ivoire.ci' },
  { name: 'Grossiste Atlantique', contact: 'Mme Kouassi', phone: '+225 05 44 33 22', email: 'ventes@atlantique.ci' },
  { name: 'SOCIMEX', contact: 'M. Yao', phone: '+225 01 88 77 66', email: 'commercial@socimex.ci' },
];

// subCategory, reference, designation, unit, min, max, buy, sell, popularity,
// unitsPerCarton, cartonBuyPrice, cartonSellPrice
//
// Popularity (0-1) drives how often the product moves, which is what makes the
// trending ranking meaningful and the dormant-stock report non-empty.
const PRODUCTS = [
  ['Sodas et jus', 'DEMO-BOI-001', 'Coca-Cola 33cl', 'bouteille', 120, 1200, 200, 300, 0.95, 24, 4300, 6600],
  ['Sodas et jus', 'DEMO-BOI-002', 'Fanta Orange 33cl', 'bouteille', 100, 1000, 195, 290, 0.80, 24, 4200, 6400],
  ['Sodas et jus', 'DEMO-BOI-003', "Jus d'orange 1L", 'bouteille', 40, 400, 900, 1400, 0.55, 12, 10200, 16000],
  ['Eaux', 'DEMO-EAU-001', 'Eau minérale 1.5L', 'bouteille', 150, 1500, 300, 450, 0.98, 6, 1700, 2600],
  ['Eaux', 'DEMO-EAU-002', 'Eau minérale 50cl', 'bouteille', 200, 2000, 125, 200, 0.85, 12, 1400, 2300],
  ['Boisson énergétique', 'DEMO-ENE-001', 'Red Bull 25cl', 'canette', 60, 600, 700, 1100, 0.70, 24, 16000, 25000],
  ['Boisson énergétique', 'DEMO-ENE-002', 'XXL Energy 50cl', 'canette', 40, 400, 500, 800, 0.35, 12, 5700, 9200],
  ['Vin', 'DEMO-VIN-001', 'Vin rouge Bordeaux 75cl', 'bouteille', 24, 200, 3500, 5500, 0.30, 6, 20000, 32000],
  ['Vin', 'DEMO-VIN-002', 'Vin blanc moelleux 75cl', 'bouteille', 18, 150, 3000, 4800, 0.15, 6, 17000, 27500],
  ['Champagne', 'DEMO-CHA-001', 'Champagne brut 75cl', 'bouteille', 12, 80, 18000, 27000, 0.08, 6, 105000, 158000],
  ['Liqueur', 'DEMO-LIQ-001', 'Whisky 70cl', 'bouteille', 20, 150, 9000, 14000, 0.25, 6, 52000, 82000],
  ['Liqueur', 'DEMO-LIQ-002', 'Liqueur de café 70cl', 'bouteille', 12, 100, 7500, 12000, 0.05, 6, 43000, 70000],
  ['Sucrerie', 'DEMO-SUC-001', 'Bonbons assortis 1kg', 'paquet', 30, 300, 1800, 2800, 0.60, 10, 17000, 26500],
  ['Sucrerie', 'DEMO-SUC-002', 'Chocolat tablette 100g', 'unité', 50, 500, 600, 950, 0.45, 24, 13500, 21500],
];

async function clear() {
  const products = await prisma.product.findMany({
    where: { reference: { startsWith: REF_PREFIX } },
    select: { id: true },
  });
  const ids = products.map((p) => p.id);

  if (ids.length === 0) {
    console.log('\n  Nothing to clear.\n');
    return;
  }

  await prisma.$transaction([
    prisma.alert.deleteMany({ where: { productId: { in: ids } } }),
    prisma.stockMovement.deleteMany({ where: { productId: { in: ids } } }),
    prisma.stockLevel.deleteMany({ where: { productId: { in: ids } } }),
    prisma.goodsReceiptLine.deleteMany({ where: { productId: { in: ids } } }),
    prisma.goodsIssueLine.deleteMany({ where: { productId: { in: ids } } }),
    prisma.productSupplier.deleteMany({ where: { productId: { in: ids } } }),
    prisma.product.deleteMany({ where: { id: { in: ids } } }),
  ]);

  console.log(`\n  Removed ${ids.length} demo products and everything attached to them.\n`);
}

async function main() {
  if (process.argv.includes('--clear')) return clear();

  const author = await prisma.user.findFirst({
    where: { role: 'ADMIN', password: { not: null } },
    orderBy: { createdAt: 'asc' },
  });
  if (!author) {
    throw new Error(
      'No activated administrator found. Create one first:\n' +
        '    npm run create-admin -- --email … --name "…" --password "…"'
    );
  }

  const existing = await prisma.product.count({ where: { reference: { startsWith: REF_PREFIX } } });
  if (existing > 0) {
    throw new Error(`${existing} demo products already exist. Run with --clear first.`);
  }

  console.log(`\n  Movements will be attributed to ${author.email} (BR-5).\n`);

  // ---- suppliers ---------------------------------------------------------
  const suppliers = [];
  for (const s of SUPPLIERS) {
    const found = await prisma.supplier.findFirst({ where: { name: s.name } });
    suppliers.push(found ?? (await prisma.supplier.create({ data: s })));
  }
  console.log(`  ${suppliers.length} suppliers`);

  // ---- products ----------------------------------------------------------
  const categories = await prisma.category.findMany({ where: { parentId: { not: null } } });
  const byName = new Map(categories.map((c) => [c.name, c]));

  const products = [];
  for (const [
    categoryName, reference, designation, unit, min, max,
    buy, sell, popularity, unitsPerCarton, cartonBuy, cartonSell,
  ] of PRODUCTS) {
    const category = byName.get(categoryName);
    if (!category) {
      console.log(`  ! skipped ${reference}: no sub-category named "${categoryName}"`);
      continue;
    }

    const product = await prisma.product.create({
      data: {
        reference,
        designation,
        categoryId: category.id,
        unit,
        minThreshold: min,
        maxThreshold: max,
        buyPrice: buy,
        sellPrice: sell,
        unitsPerCarton,
        groupingUnit: 'carton',
        cartonBuyPrice: cartonBuy,
        cartonSellPrice: cartonSell,
      },
    });

    await prisma.productSupplier.create({
      data: { productId: product.id, supplierId: pick(suppliers).id, lastPurchasePrice: buy },
    });

    products.push({ ...product, popularity });
  }
  console.log(`  ${products.length} products`);

  // ---- opening stock + 90 days of movements ------------------------------
  // Opening balances enter as ADJUSTMENT so the ledger is complete from the
  // first row - the same approach a real go-live migration uses (§10 Phase 8).
  const levels = new Map();
  const movements = [];

  const openingDate = daysAgo(DAYS_OF_HISTORY + 1);
  for (const product of products) {
    const opening = randomInt(product.minThreshold * 2, product.minThreshold * 5);
    levels.set(product.id, opening);
    movements.push({
      type: 'ADJUSTMENT',
      productId: product.id,
      quantity: opening,
      balanceAfter: opening,
      reason: 'Stock initial',
      refType: 'Adjustment',
      userId: author.id,
      createdAt: openingDate,
    });
  }

  for (let day = DAYS_OF_HISTORY; day >= 0; day--) {
    const date = daysAgo(day);
    if (date.getDay() === 0) continue; // closed on Sundays

    for (const product of products) {
      // OUT - frequency scales with popularity.
      if (random() < product.popularity * 0.55) {
        const current = levels.get(product.id);
        const requested = randomInt(1, Math.max(2, Math.round(product.minThreshold * 0.3)));
        const quantity = Math.min(requested, current);
        if (quantity > 0) {
          const balanceAfter = current - quantity;
          levels.set(product.id, balanceAfter);
          movements.push({
            type: 'OUT',
            productId: product.id,
            quantity,
            balanceAfter,
            reason: pick(['Vente', 'Vente', 'Vente', 'Besoin interne', 'Casse']),
            refType: 'GoodsIssue',
            userId: author.id,
            createdAt: date,
          });
        }
      }

      // IN - replenishment as the level approaches the threshold.
      const current = levels.get(product.id);
      if (current < product.minThreshold * 1.4 && random() < 0.3) {
        const quantity = randomInt(product.minThreshold, product.minThreshold * 2);
        const balanceAfter = current + quantity;
        levels.set(product.id, balanceAfter);
        movements.push({
          type: 'IN',
          productId: product.id,
          quantity,
          balanceAfter,
          unitCost: product.buyPrice,
          reason: 'Réception fournisseur',
          refType: 'GoodsReceipt',
          userId: author.id,
          createdAt: date,
        });
      }
    }
  }

  movements.sort((a, b) => a.createdAt - b.createdAt);
  await prisma.stockMovement.createMany({ data: movements });
  console.log(`  ${movements.length} stock movements over ${DAYS_OF_HISTORY} days`);

  await prisma.stockLevel.createMany({
    data: [...levels.entries()].map(([productId, quantity]) => ({ productId, quantity })),
  });
  console.log(`  ${levels.size} stock levels`);

  // ---- alerts for whatever ended up outside its thresholds ---------------
  const alerts = [];
  for (const product of products) {
    const quantity = levels.get(product.id);
    if (quantity < product.minThreshold) {
      alerts.push({
        productId: product.id,
        type: 'MIN_THRESHOLD',
        status: 'OPEN',
        quantityAtTrigger: quantity,
        thresholdValue: product.minThreshold,
      });
    } else if (product.maxThreshold && quantity > product.maxThreshold) {
      alerts.push({
        productId: product.id,
        type: 'MAX_THRESHOLD',
        status: 'OPEN',
        quantityAtTrigger: quantity,
        thresholdValue: product.maxThreshold,
      });
    }
  }
  if (alerts.length) await prisma.alert.createMany({ data: alerts });
  console.log(`  ${alerts.length} open alerts`);

  console.log('\n  Done. Sign in and the dashboard, trends and reports now have data.\n');
}

main()
  .catch((error) => {
    console.error(`\n  Failed: ${error.message}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
