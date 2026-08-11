'use strict';

/**
 * Demo data for local development and recette.
 *
 * Generates 90 days of back-dated movements on purpose: the trend and dormant-stock
 * features (§4.6) are untestable without history, and discovering that in Phase 6
 * would be far too late.
 *
 * Idempotent — safe to re-run. Run with: npm run db:seed
 */

const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const DAYS_OF_HISTORY = 90;
const DEMO_PASSWORD = 'Siprocom2026!';

// Deterministic PRNG so every seed run produces the same dataset —
// reproducible bug reports beat "it worked on my machine".
let seed = 20260807;
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

const USERS = [
  { name: 'Admin SIPROCOM', email: 'admin@siprocom.com', role: 'ADMIN' },
  { name: 'Koffi Mensah', email: 'magasinier@siprocom.com', role: 'MAGASINIER' },
  { name: 'Aïcha Traoré', email: 'achats@siprocom.com', role: 'ACHATS' },
  { name: 'Direction Générale', email: 'direction@siprocom.com', role: 'DIRECTION' },
  { name: 'Système', email: 'system@siprocom.com', role: 'ADMIN' }, // owns automated movements (BR-5)
];

const WAREHOUSES = [
  { code: 'ENT-PRINCIPAL', name: 'Entrepôt Principal', address: 'Zone Industrielle, Abidjan', managerName: 'Koffi Mensah' },
  { code: 'ENT-NORD', name: 'Entrepôt Nord', address: 'Route de Bouaké', managerName: 'Salif Koné' },
  { code: 'ENT-BOUTIQUE', name: 'Réserve Boutique', address: 'Plateau, Abidjan', managerName: 'Awa Diallo' },
];

const CATEGORIES = [
  { name: 'Boissons', nameEn: 'Beverages', children: ['Sodas', 'Eaux', 'Jus'] },
  { name: 'Alimentaire', nameEn: 'Food', children: ['Conserves', 'Céréales'] },
  { name: 'Entretien', nameEn: 'Cleaning', children: ['Détergents', 'Papeterie'] },
  { name: 'Emballage', nameEn: 'Packaging', children: [] },
];

const SUPPLIERS = [
  { name: 'Distribution Ivoire SA', contact: 'M. Bamba', phone: '+225 07 00 11 22', email: 'contact@dist-ivoire.ci' },
  { name: 'Grossiste Atlantique', contact: 'Mme Kouassi', phone: '+225 05 44 33 22', email: 'ventes@atlantique.ci' },
  { name: 'SOCIMEX', contact: 'M. Yao', phone: '+225 01 88 77 66', email: 'commercial@socimex.ci' },
  { name: 'Comptoir du Nord', contact: 'M. Ouattara', phone: '+225 07 55 44 33', email: 'info@comptoirnord.ci' },
  { name: 'Emballages Plus', contact: 'Mme Bakayoko', phone: '+225 05 12 34 56', email: 'contact@embplus.ci' },
];

const PRODUCTS = [
  // subCategory, reference, designation, designationEn, unit, min, max, buy, sell,
  // popularity (0-1 drives rotation), unitsPerCarton, cartonSellPrice
  //
  // Drinks carry a carton factor so the packaging feature is exercised by the
  // demo data: a dataset that never triggers a feature cannot reveal it broken.
  ['Sodas', 'BOI-001', 'Coca-Cola 33cl (pack 24)', 'Coca-Cola 33cl (24-pack)', 'bottle', 20, 200, 4800, 6000, 0.95, 24, 132000],
  ['Sodas', 'BOI-002', 'Fanta Orange 33cl (pack 24)', 'Fanta Orange 33cl (24-pack)', 'bottle', 15, 150, 4600, 5800, 0.8, 24, 127000],
  ['Sodas', 'BOI-003', 'Sprite 33cl (pack 24)', 'Sprite 33cl (24-pack)', 'bottle', 15, 150, 4600, 5800, 0.6, 24, 127000],
  ['Eaux', 'BOI-010', 'Eau minérale 1.5L (pack 6)', 'Mineral water 1.5L (6-pack)', 'bottle', 40, 400, 1800, 2500, 0.98, 6, 14500],
  ['Eaux', 'BOI-011', 'Eau minérale 50cl (pack 12)', 'Mineral water 50cl (12-pack)', 'bottle', 30, 300, 1500, 2200, 0.85, 12, 25000],
  ['Jus', 'BOI-020', 'Jus d\'orange 1L', 'Orange juice 1L', 'bottle', 25, 200, 900, 1400, 0.7, 12, 16000],
  ['Jus', 'BOI-021', 'Jus d\'ananas 1L', 'Pineapple juice 1L', 'bottle', 20, 150, 900, 1400, 0.45, 12, 16000],
  ['Jus', 'BOI-022', 'Nectar mangue 1L', 'Mango nectar 1L', 'bottle', 15, 100, 950, 1500, 0.15, 12, 17000],
  ['Conserves', 'ALI-001', 'Tomate concentrée 400g', 'Tomato paste 400g', 'unit', 50, 500, 450, 700, 0.9],
  ['Conserves', 'ALI-002', 'Sardines à l\'huile 125g', 'Sardines in oil 125g', 'unit', 40, 400, 550, 850, 0.75],
  ['Conserves', 'ALI-003', 'Haricots rouges 400g', 'Red beans 400g', 'unit', 30, 250, 500, 800, 0.35],
  ['Céréales', 'ALI-010', 'Riz parfumé 25kg', 'Fragrant rice 25kg', 'bag', 10, 100, 14000, 17500, 0.92],
  ['Céréales', 'ALI-011', 'Semoule de blé 5kg', 'Wheat semolina 5kg', 'bag', 15, 120, 3200, 4200, 0.5],
  ['Céréales', 'ALI-012', 'Farine de blé 50kg', 'Wheat flour 50kg', 'bag', 8, 60, 22000, 27000, 0.4],
  ['Détergents', 'ENT-001', 'Savon de lessive 500g', 'Laundry soap 500g', 'unit', 40, 350, 350, 550, 0.88],
  ['Détergents', 'ENT-002', 'Eau de javel 1L', 'Bleach 1L', 'unit', 30, 250, 400, 650, 0.65],
  ['Détergents', 'ENT-003', 'Liquide vaisselle 750ml', 'Dish soap 750ml', 'unit', 25, 200, 800, 1200, 0.55],
  ['Papeterie', 'ENT-010', 'Papier hygiénique (pack 8)', 'Toilet paper (8-pack)', 'carton', 20, 180, 1800, 2600, 0.72],
  ['Papeterie', 'ENT-011', 'Serviettes en papier', 'Paper towels', 'carton', 15, 120, 1500, 2200, 0.3],
  ['Papeterie', 'ENT-012', 'Mouchoirs boîte 100', 'Tissues box of 100', 'unit', 20, 150, 600, 950, 0.08],
  ['Emballage', 'EMB-001', 'Sachet plastique 30x40 (x100)', 'Plastic bag 30x40 (x100)', 'pack', 30, 300, 1200, 1800, 0.78],
  ['Emballage', 'EMB-002', 'Carton d\'emballage moyen', 'Medium packing box', 'unit', 50, 500, 250, 400, 0.6],
  ['Emballage', 'EMB-003', 'Ruban adhésif 50m', 'Adhesive tape 50m', 'unit', 25, 200, 450, 700, 0.42],
  ['Emballage', 'EMB-004', 'Film étirable 2kg', 'Stretch film 2kg', 'unit', 10, 80, 3500, 4800, 0.05],
];

/**
 * Refuses to run against anything that is not a local database.
 *
 * The seed opens with deleteMany() on every table and then creates four
 * accounts whose password is published in the README. Pointed at production it
 * destroys the real data and leaves publicly-known credentials behind.
 *
 * A warning in the documentation is not enough: `.env` is edited to point at
 * production for a migration and then left there, and the next `db:seed` in a
 * terminal does the damage. I made exactly that mistake against this project's
 * Neon database. The guard belongs in the script.
 *
 * Override deliberately with ALLOW_REMOTE_SEED=yes-destroy-this-database.
 */
function assertLocalDatabase(url) {
  if (process.env.ALLOW_REMOTE_SEED === 'yes-destroy-this-database') {
    console.warn('\n  ALLOW_REMOTE_SEED is set — seeding a non-local database on purpose.\n');
    return;
  }

  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error('DATABASE_URL is unreadable');
  }

  const isLocal = ['localhost', '127.0.0.1', '::1', 'db', 'postgres'].includes(host);
  if (!isLocal) {
    throw new Error(
      `Refusing to seed a remote database (${host}).\n\n` +
        '  This script deletes every row and creates demo accounts with a public\n' +
        '  password. On production that is data loss plus an open door.\n\n' +
        '  To create the first real administrator instead:\n' +
        '    npm run create-admin -- --email … --name "…" --password "…"\n'
    );
  }
}

async function main() {
  assertLocalDatabase(process.env.DATABASE_URL || '');

  console.log('Seeding SIPROCOM SGS…\n');

  // Order matters: children before parents.
  console.log('  Clearing existing data…');
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.alert.deleteMany(),
    prisma.stockMovement.deleteMany(),
    prisma.stockLevel.deleteMany(),
    prisma.goodsReceiptLine.deleteMany(),
    prisma.goodsIssueLine.deleteMany(),
    prisma.goodsReceipt.deleteMany(),
    prisma.goodsIssue.deleteMany(),
    prisma.productSupplier.deleteMany(),
    prisma.product.deleteMany(),
    prisma.category.deleteMany(),
    prisma.supplier.deleteMany(),
    prisma.warehouse.deleteMany(),
    prisma.user.deleteMany(),
    prisma.counter.deleteMany(),
  ]);

  // ---- users -------------------------------------------------------------
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const users = {};
  for (const u of USERS) {
    const created = await prisma.user.create({
      data: { ...u, password: passwordHash, locale: 'fr' },
    });
    users[u.role === 'ADMIN' && u.email.startsWith('system') ? 'SYSTEM' : u.role] = created;
  }
  console.log(`  ${USERS.length} users`);

  // ---- warehouses --------------------------------------------------------
  const warehouses = [];
  for (const w of WAREHOUSES) {
    warehouses.push(await prisma.warehouse.create({ data: w }));
  }
  console.log(`  ${warehouses.length} warehouses`);

  // ---- categories (parent + children) ------------------------------------
  const categoryByName = {};
  for (const c of CATEGORIES) {
    const parent = await prisma.category.create({
      data: { name: c.name, nameEn: c.nameEn, description: `Catégorie ${c.name}` },
    });
    categoryByName[c.name] = parent;
    for (const childName of c.children) {
      categoryByName[childName] = await prisma.category.create({
        data: { name: childName, parentId: parent.id },
      });
    }
  }
  console.log(`  ${Object.keys(categoryByName).length} categories`);

  // ---- suppliers ---------------------------------------------------------
  const suppliers = [];
  for (const s of SUPPLIERS) {
    suppliers.push(await prisma.supplier.create({ data: s }));
  }
  console.log(`  ${suppliers.length} suppliers`);

  // ---- products ----------------------------------------------------------
  const products = [];
  for (const [cat, reference, designation, designationEn, unit, min, max, buy, sell, popularity, unitsPerCarton, cartonSellPrice] of PRODUCTS) {
    const product = await prisma.product.create({
      data: {
        reference,
        designation,
        designationEn,
        categoryId: categoryByName[cat].id,
        unit,
        minThreshold: min,
        maxThreshold: max,
        buyPrice: buy,
        sellPrice: sell,
        unitsPerCarton: unitsPerCarton ?? null,
        cartonSellPrice: cartonSellPrice ?? null,
      },
    });
    // Each product gets one or two suppliers.
    const primary = pick(suppliers);
    await prisma.productSupplier.create({
      data: { productId: product.id, supplierId: primary.id, lastPurchasePrice: buy },
    });
    products.push({ ...product, popularity });
  }
  console.log(`  ${products.length} products`);

  // ---- opening stock -----------------------------------------------------
  // Enters as ADJUSTMENT movements so the ledger is complete from day one —
  // the same approach the real go-live migration will use (§10 Phase 8).
  const levels = new Map(); // `${productId}:${warehouseId}` -> quantity
  const movements = [];
  const key = (p, w) => `${p}:${w}`;

  const openingDate = daysAgo(DAYS_OF_HISTORY + 1);
  for (const product of products) {
    for (const warehouse of warehouses) {
      // The boutique reserve only carries the fast movers.
      if (warehouse.code === 'ENT-BOUTIQUE' && product.popularity < 0.5) continue;

      const opening = randomInt(product.minThreshold * 2, product.minThreshold * 6);
      levels.set(key(product.id, warehouse.id), opening);
      movements.push({
        type: 'ADJUSTMENT',
        productId: product.id,
        warehouseId: warehouse.id,
        quantity: opening,
        balanceAfter: opening,
        reason: 'Stock initial',
        refType: 'Adjustment',
        userId: users.SYSTEM.id,
        createdAt: openingDate,
      });
    }
  }

  // ---- 90 days of movements ---------------------------------------------
  // Popularity drives issue frequency, which is what makes the trending
  // report meaningful and the dormant-stock report non-empty.
  for (let day = DAYS_OF_HISTORY; day >= 0; day--) {
    const date = daysAgo(day);
    const isSunday = date.getDay() === 0;
    if (isSunday) continue;

    for (const product of products) {
      for (const warehouse of warehouses) {
        const stockKey = key(product.id, warehouse.id);
        if (!levels.has(stockKey)) continue;

        // OUT — frequency scales with popularity.
        if (random() < product.popularity * 0.55) {
          const current = levels.get(stockKey);
          const requested = randomInt(1, Math.max(2, Math.round(product.minThreshold * 0.35)));
          const quantity = Math.min(requested, current);
          if (quantity > 0) {
            const balanceAfter = current - quantity;
            levels.set(stockKey, balanceAfter);
            movements.push({
              type: 'OUT',
              productId: product.id,
              warehouseId: warehouse.id,
              quantity,
              balanceAfter,
              reason: pick(['Vente', 'Vente', 'Vente', 'Besoin interne', 'Casse']),
              refType: 'GoodsIssue',
              userId: users.MAGASINIER.id,
              createdAt: date,
            });
          }
        }

        // IN — replenishment when the level approaches the threshold.
        const current = levels.get(stockKey);
        if (current < product.minThreshold * 1.4 && random() < 0.3) {
          const quantity = randomInt(product.minThreshold, product.minThreshold * 3);
          const balanceAfter = current + quantity;
          levels.set(stockKey, balanceAfter);
          movements.push({
            type: 'IN',
            productId: product.id,
            warehouseId: warehouse.id,
            quantity,
            balanceAfter,
            unitCost: product.buyPrice,
            reason: 'Réception fournisseur',
            refType: 'GoodsReceipt',
            userId: users.MAGASINIER.id,
            createdAt: date,
          });
        }
      }
    }
  }

  movements.sort((a, b) => a.createdAt - b.createdAt);
  await prisma.stockMovement.createMany({ data: movements });
  console.log(`  ${movements.length} stock movements over ${DAYS_OF_HISTORY} days`);

  // ---- materialised stock levels ----------------------------------------
  const stockLevelRows = [];
  for (const [stockKey, quantity] of levels.entries()) {
    const [productId, warehouseId] = stockKey.split(':');
    stockLevelRows.push({ productId, warehouseId, quantity });
  }
  await prisma.stockLevel.createMany({ data: stockLevelRows });
  console.log(`  ${stockLevelRows.length} stock levels`);

  // ---- alerts for whatever ended up below threshold ----------------------
  const alerts = [];
  for (const row of stockLevelRows) {
    const product = products.find((p) => p.id === row.productId);
    if (row.quantity < product.minThreshold) {
      alerts.push({
        productId: row.productId,
        warehouseId: row.warehouseId,
        type: 'MIN_THRESHOLD',
        status: 'OPEN',
        quantityAtTrigger: row.quantity,
        thresholdValue: product.minThreshold,
      });
    } else if (product.maxThreshold && row.quantity > product.maxThreshold) {
      alerts.push({
        productId: row.productId,
        warehouseId: row.warehouseId,
        type: 'MAX_THRESHOLD',
        status: 'OPEN',
        quantityAtTrigger: row.quantity,
        thresholdValue: product.maxThreshold,
      });
    }
  }
  if (alerts.length) await prisma.alert.createMany({ data: alerts });
  console.log(`  ${alerts.length} open alerts`);

  // ---- document counters -------------------------------------------------
  const year = new Date().getFullYear();
  await prisma.counter.createMany({
    data: [
      { key: `BE-${year}`, value: 0 },
      { key: `BS-${year}`, value: 0 },
    ],
  });

  console.log('\nSeed complete.\n');
  console.log('  Login with any of these (same password):');
  for (const u of USERS.filter((u) => !u.email.startsWith('system'))) {
    console.log(`    ${u.role.padEnd(11)} ${u.email}`);
  }
  console.log(`\n  Password: ${DEMO_PASSWORD}\n`);
}

main()
  .catch((error) => {
    console.error('\nSeed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
