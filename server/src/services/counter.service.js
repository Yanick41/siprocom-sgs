'use strict';

/**
 * Gapless, race-safe document numbering (BR-10).
 *
 * The allocation is a single atomic UPDATE ... RETURNING inside the caller's
 * transaction. Two magasiniers validating at the same instant serialise on the
 * counter row, so numbers are never duplicated and never skipped.
 *
 * Reading MAX(number)+1 instead would hand both callers the same value.
 */

const PREFIXES = {
  RECEIPT: 'BE', // bon d'entrée
  ISSUE: 'BS', // bon de sortie
  INVOICE: 'FA', // facture
};

/**
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {'RECEIPT'|'ISSUE'|'INVOICE'} kind
 * @returns {Promise<string>} e.g. "BE-2026-0001"
 */
async function allocateNumber(tx, kind) {
  const prefix = PREFIXES[kind];
  if (!prefix) throw new Error(`Unknown counter kind: ${kind}`);

  const year = new Date().getFullYear();
  const key = `${prefix}-${year}`;

  // Upsert-and-increment in one statement so a brand-new year needs no seeding.
  const rows = await tx.$queryRaw`
    INSERT INTO counters (key, value)
    VALUES (${key}, 1)
    ON CONFLICT (key) DO UPDATE SET value = counters.value + 1
    RETURNING value
  `;

  const sequence = Number(rows[0].value);
  return `${key}-${String(sequence).padStart(4, '0')}`;
}

module.exports = { allocateNumber, PREFIXES };
