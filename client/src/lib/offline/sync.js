/**
 * Replays the offline queue against the server.
 *
 * The rule this file exists to respect: the server decides. Every entry is
 * re-sent exactly as it was captured and the server re-runs the same
 * validation, the same permission check and the same BR-2 conditional
 * decrement it would have run had the device been online. Nothing here
 * inspects stock or predicts an outcome.
 *
 * Three outcomes per entry:
 *
 *   accepted   2xx, or a duplicate the server recognised. Entry is dropped.
 *   conflict   4xx on the merits - not enough stock, product deactivated,
 *              permission withdrawn. Entry is parked for a person to look at.
 *              Retrying would fail identically, forever.
 *   deferred   the network is still down, or the server broke (5xx). Entry
 *              stays pending and the next flush tries again.
 *
 * Strictly sequential. Two sorties of the same product must arrive in the
 * order they were entered, or the second can be refused for want of stock the
 * first was about to consume. That costs latency and buys correctness.
 */

import api, { ApiError } from '@/api/client';
import { listPending, remove, update, STATUS } from './queue';

let flushing = false;
const listeners = new Set();

/** Notifies the UI that a flush started, progressed or finished. */
export function onSyncChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(state) {
  for (const fn of listeners) {
    try {
      fn(state);
    } catch {
      /* ignore */
    }
  }
}

/**
 * A 4xx means the server understood and refused: replaying cannot change the
 * answer. A 0 (no network) or 5xx is a transport or server fault and is worth
 * another attempt later.
 *
 * 401 is the exception among 4xx. The session expired while the device was
 * away, which says nothing about the entry itself - it must survive until
 * someone signs in again.
 */
function isPermanent(error) {
  if (!(error instanceof ApiError)) return false;
  if (error.status === 401) return false;
  return error.status >= 400 && error.status < 500;
}

/**
 * Sends one entry.
 *
 * The idempotency key travels as the row id in the body, so a replay whose
 * response was lost collides on the primary key and comes back as the record
 * that already exists rather than writing a second one.
 */
async function send(entry) {
  const body = entry.body ? { ...entry.body, id: entry.idempotencyKey } : undefined;
  return api.request({ method: entry.method, url: entry.url, data: body });
}

/**
 * Drains the queue. Safe to call from anywhere and as often as you like: a
 * second caller while a flush is running returns immediately rather than
 * sending everything twice.
 */
export async function flush() {
  if (flushing) return { skipped: true };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { skipped: true, offline: true };
  }

  flushing = true;
  emit({ running: true });

  const result = { sent: 0, conflicts: 0, deferred: 0 };

  try {
    // Sorted here as well as in listPending(). Order is the correctness
    // property this loop rests on, and leaving it to a guarantee made in
    // another module is how it quietly stops holding.
    const pending = [...(await listPending())].sort((a, b) => a.seq - b.seq);

    for (const entry of pending) {
      try {
        await send(entry);
        await remove(entry.id);
        result.sent += 1;
      } catch (error) {
        if (isPermanent(error)) {
          await update(entry.id, {
            status: STATUS.CONFLICT,
            attempts: entry.attempts + 1,
            lastError: error.code || 'UNKNOWN',
          });
          result.conflicts += 1;
          // A refusal is about this entry alone. Later entries are unrelated
          // documents and deserve their own attempt.
          continue;
        }

        await update(entry.id, {
          attempts: entry.attempts + 1,
          lastError: error.code || 'NETWORK_ERROR',
        });
        result.deferred += 1;
        // Transport is down or the server is unwell. Stop: hammering it with
        // the rest of the queue helps nobody, and order must hold.
        break;
      }
    }
  } finally {
    flushing = false;
    emit({ running: false, ...result });
  }

  return result;
}

/**
 * Starts the background replay.
 *
 * Flushes on the `online` event, and once at startup because a device can boot
 * already connected with a queue left from last time. The interval is a
 * backstop: `online` fires on regaining a network interface, which is not the
 * same as regaining a route to the server. A captive portal or a dead uplink
 * leaves navigator.onLine true and every request failing.
 */
export function startSync({ intervalMs = 60_000 } = {}) {
  const run = () => {
    flush().catch(() => {
      /* flush already records the failure per entry */
    });
  };

  window.addEventListener('online', run);
  const timer = setInterval(run, intervalMs);
  run();

  return () => {
    window.removeEventListener('online', run);
    clearInterval(timer);
  };
}
