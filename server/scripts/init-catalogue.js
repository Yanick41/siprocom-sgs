'use strict';

/**
 * Creates the reference data a new installation needs: `npm run init-catalogue`
 *
 * Safe on a live database, unlike the demo seed. It only inserts what is
 * missing — no deleteMany, no demo accounts, no public password. Re-running it
 * changes nothing, so it is safe after adding a category by hand.
 *
 * Categories are those of an off-licence: wine, spirits, champagne,
 * confectionery, energy drinks. Adjust the list below to the shop's reality —
 * it is a starting point, not a fixed taxonomy.
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * Two levels, as the data model requires: products hang off a sub-category.
 * A single-level list would leave the product form's dropdown empty, since it
 * only offers leaves.
 */
const CATALOGUE = [
  {
    name: 'Boissons alcoolisées',
    nameEn: 'Alcoholic drinks',
    children: [
      { name: 'Vin', nameEn: 'Wine' },
      { name: 'Liqueur', nameEn: 'Spirits' },
      { name: 'Champagne', nameEn: 'Champagne' },
    ],
  },
  {
    name: 'Boissons sans alcool',
    nameEn: 'Soft drinks',
    children: [
      { name: 'Boisson énergétique', nameEn: 'Energy drink' },
      { name: 'Sodas et jus', nameEn: 'Sodas and juices' },
      { name: 'Eaux', nameEn: 'Water' },
    ],
  },
  {
    name: 'Épicerie',
    nameEn: 'Grocery',
    children: [{ name: 'Sucrerie', nameEn: 'Confectionery' }],
  },
];

async function main() {
  const [{ db }] = await prisma.$queryRaw`SELECT current_database() AS db`;
  console.log(`\n  Database: ${db}\n`);

  let created = 0;
  let existing = 0;

  for (const parent of CATALOGUE) {
    // Matched on name, so a category added by hand is adopted rather than
    // duplicated.
    let root = await prisma.category.findFirst({ where: { name: parent.name, parentId: null } });
    if (root) {
      existing += 1;
    } else {
      root = await prisma.category.create({ data: { name: parent.name, nameEn: parent.nameEn } });
      created += 1;
      console.log(`  + ${parent.name}`);
    }

    for (const child of parent.children) {
      const found = await prisma.category.findFirst({
        where: { name: child.name, parentId: root.id },
      });
      if (found) {
        existing += 1;
        continue;
      }
      await prisma.category.create({
        data: { name: child.name, nameEn: child.nameEn, parentId: root.id },
      });
      created += 1;
      console.log(`  +   ${child.name}`);
    }
  }

  console.log(`\n  ${created} created, ${existing} already present.\n`);
}

main()
  .catch((error) => {
    console.error('\n  Failed:', error.message.split('\n')[0], '\n');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
