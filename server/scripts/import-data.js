'use strict';

/**
 * Go-live data migration (§8 "Reprise des données existantes").
 *
 * Imports product records and opening stock from CSV. Opening balances enter as
 * ADJUSTMENT movements rather than direct writes to stock_levels, so the ledger
 * is complete from the very first day and `reconcile` passes immediately after
 * go-live. A direct write would leave every product with stock that no movement
 * explains.
 *
 * Usage:
 *   node scripts/import-data.js --products products.csv [--dry-run]
 *   node scripts/import-data.js --stock stock.csv --user admin@siprocom.com
 *
 * products.csv columns (header required):
 *   reference,designation,designationEn,category,unit,minThreshold,maxThreshold,buyPrice,sellPrice,barcode,supplier
 *
 * stock.csv columns:
 *   reference,quantity
 *
 * The importer is idempotent on products (upsert by reference) and refuses to
 * apply an opening balance twice to the same product.
 */

const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const { applyMovement } = require('../src/services/stock.service');

const prisma = new PrismaClient();

// ---- CSV parsing ---------------------------------------------------------

/**
 * Minimal RFC-4180 parser: handles quoted fields, embedded commas, escaped
 * quotes and CRLF. A split(',') would corrupt any designation containing a
 * comma, which product names routinely do.
 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') inQuotes = true;
    else if (char === ',') {
      row.push(field.trim());
      field = '';
    } else if (char === '\n') {
      row.push(field.trim());
      if (row.some((cell) => cell !== '')) rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  row.push(field.trim());
  if (row.some((cell) => cell !== '')) rows.push(row);

  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.replace(/^﻿/, '')); // strip Excel's BOM
  return rows.slice(1).map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? '']))
  );
}

const readCsv = (file) => parseCsv(fs.readFileSync(path.resolve(file), 'utf8'));

// ---- Products ------------------------------------------------------------

async function importProducts(file, { dryRun }) {
  const rows = readCsv(file);
  console.log(`\nProducts: ${rows.length} rows read from ${file}`);

  const report = { created: 0, updated: 0, skipped: 0, errors: [] };

  for (const [index, row] of rows.entries()) {
    const line = index + 2; // +1 for the header, +1 for 1-based numbering

    if (!row.reference || !row.designation) {
      report.errors.push(`line ${line}: reference and designation are required`);
      report.skipped += 1;
      continue;
    }

    try {
      // Categories are created on demand - a go-live file rarely matches an
      // empty category table, and failing the whole import over a missing
      // category would be unhelpful.
      let category = await prisma.category.findFirst({ where: { name: row.category || 'Divers' } });
      if (!category && !dryRun) {
        category = await prisma.category.create({ data: { name: row.category || 'Divers' } });
      }

      const data = {
        reference: row.reference,
        designation: row.designation,
        designationEn: row.designationEn || null,
        barcode: row.barcode || null,
        unit: row.unit || 'unit',
        minThreshold: Number.parseInt(row.minThreshold, 10) || 0,
        maxThreshold: row.maxThreshold ? Number.parseInt(row.maxThreshold, 10) : null,
        buyPrice: Number.parseFloat(row.buyPrice) || 0,
        sellPrice: Number.parseFloat(row.sellPrice) || 0,
        categoryId: category?.id,
      };

      if (data.maxThreshold != null && data.maxThreshold < data.minThreshold) {
        report.errors.push(`line ${line}: maxThreshold below minThreshold`);
        report.skipped += 1;
        continue;
      }

      const existing = await prisma.product.findUnique({ where: { reference: row.reference } });

      if (dryRun) {
        if (existing) report.updated += 1;
        else report.created += 1;
        continue;
      }

      if (existing) {
        await prisma.product.update({ where: { id: existing.id }, data });
        report.updated += 1;
      } else {
        const product = await prisma.product.create({ data });
        report.created += 1;

        if (row.supplier) {
          let supplier = await prisma.supplier.findFirst({ where: { name: row.supplier } });
          if (!supplier) supplier = await prisma.supplier.create({ data: { name: row.supplier } });
          await prisma.productSupplier.create({
            data: { productId: product.id, supplierId: supplier.id },
          });
        }
      }
    } catch (error) {
      report.errors.push(`line ${line} (${row.reference}): ${error.message}`);
      report.skipped += 1;
    }
  }

  return report;
}

// ---- Opening stock -------------------------------------------------------

async function importStock(file, { dryRun, userEmail }) {
  const rows = readCsv(file);
  console.log(`\nOpening stock: ${rows.length} rows read from ${file}`);

  const user = await prisma.user.findUnique({ where: { email: userEmail } });
  if (!user) throw new Error(`User not found: ${userEmail} (pass --user <email>)`);

  const report = { applied: 0, skipped: 0, errors: [] };

  for (const [index, row] of rows.entries()) {
    const line = index + 2;

    try {
      const product = await prisma.product.findUnique({ where: { reference: row.reference } });
      if (!product) {
        report.errors.push(`line ${line}: unknown product reference "${row.reference}"`);
        report.skipped += 1;
        continue;
      }

      const quantity = Number.parseInt(row.quantity, 10);
      if (!Number.isInteger(quantity) || quantity < 0) {
        report.errors.push(`line ${line}: invalid quantity "${row.quantity}"`);
        report.skipped += 1;
        continue;
      }
      if (quantity === 0) {
        report.skipped += 1;
        continue;
      }

      // Re-running the import must not double the opening balance.
      const alreadyOpened = await prisma.stockMovement.findFirst({
        where: { productId: product.id, refType: 'OpeningBalance' },
      });
      if (alreadyOpened) {
        report.errors.push(`line ${line}: opening balance already applied for ${row.reference}`);
        report.skipped += 1;
        continue;
      }

      if (dryRun) {
        report.applied += 1;
        continue;
      }

      await prisma.$transaction((tx) =>
        applyMovement(tx, {
          type: 'ADJUSTMENT',
          productId: product.id,
          quantity,
          reason: 'Stock initial (reprise de données)',
          refType: 'OpeningBalance',
          userId: user.id,
        })
      );
      report.applied += 1;
    } catch (error) {
      report.errors.push(`line ${line}: ${error.message}`);
      report.skipped += 1;
    }
  }

  return report;
}

// ---- CLI -----------------------------------------------------------------

function parseArgs(argv) {
  const args = { dryRun: false, userEmail: 'admin@siprocom.com' };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--products') args.products = argv[++i];
    else if (argv[i] === '--stock') args.stock = argv[++i];
    else if (argv[i] === '--user') args.userEmail = argv[++i];
    else if (argv[i] === '--dry-run') args.dryRun = true;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);

  if (!args.products && !args.stock) {
    console.log(`
SIPROCOM SGS - data import

  node scripts/import-data.js --products products.csv [--dry-run]
  node scripts/import-data.js --stock stock.csv --user admin@siprocom.com

Always run with --dry-run first: it reports exactly what would change without
writing anything.
`);
    return;
  }

  if (args.dryRun) console.log('\n*** DRY RUN - nothing will be written ***');

  if (args.products) {
    const report = await importProducts(args.products, args);
    console.log(`  created: ${report.created}  updated: ${report.updated}  skipped: ${report.skipped}`);
    report.errors.slice(0, 20).forEach((e) => console.log(`    ${e}`));
    if (report.errors.length > 20) console.log(`    ... and ${report.errors.length - 20} more`);
  }

  if (args.stock) {
    const report = await importStock(args.stock, args);
    console.log(`  applied: ${report.applied}  skipped: ${report.skipped}`);
    report.errors.slice(0, 20).forEach((e) => console.log(`    ${e}`));
    if (report.errors.length > 20) console.log(`    ... and ${report.errors.length - 20} more`);
  }

  console.log('');
}

main()
  .catch((error) => {
    console.error('\nImport failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
