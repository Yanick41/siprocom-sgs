'use strict';

/**
 * Create-once semantics for writes replayed from an offline device.
 *
 * A device with no network queues its documents and replays them when it comes
 * back. If a replay reaches the server, commits, and the response is lost on
 * the way home, the device retries an entry that already succeeded. Without a
 * guard that is a second bon de sortie, a second stock movement, and a ledger
 * that no longer matches the warehouse.
 *
 * The key is the row id itself. Every model here is `@id @default(uuid())`, so
 * the client can generate the id up front and reuse it on every attempt; the
 * primary key then does the deduplication that a separate idempotency table
 * would otherwise have to do. No new table, no new index, no migration.
 *
 * Two passes on purpose. The lookup answers the ordinary case cheaply, and the
 * constraint catches the race where two replays arrive together and both find
 * nothing. Only a collision on the id we supplied counts: a P2002 on some other
 * unique column (a document number, say) is a real conflict and is rethrown.
 */

const PRISMA_UNIQUE_VIOLATION = 'P2002';

/**
 * @param {object}   options
 * @param {string=}  options.id      client-supplied row id; absent for an ordinary online write
 * @param {Function} options.find    (id) => Promise<record|null>
 * @param {Function} options.create  () => Promise<record>
 * @returns {Promise<{ record: object, created: boolean }>}
 */
async function createOnce({ id, find, create }) {
  if (id) {
    const existing = await find(id);
    if (existing) return { record: existing, created: false };
  }

  try {
    return { record: await create(), created: true };
  } catch (error) {
    if (id && error?.code === PRISMA_UNIQUE_VIOLATION) {
      const existing = await find(id);
      if (existing) return { record: existing, created: false };
    }
    throw error;
  }
}

module.exports = { createOnce, PRISMA_UNIQUE_VIOLATION };
