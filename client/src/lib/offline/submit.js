/**
 * The one entry point a screen uses to write stock.
 *
 * Online it behaves exactly as a direct call did. Offline, or when the request
 * dies on the wire, the intent goes to the queue and the caller is told so.
 * The distinction matters in the UI: "enregistré" and "sera enregistré" are not
 * the same promise, and telling a magasinier the first when you mean the second
 * is how a warehouse ends up trusting a number nobody has committed.
 *
 * Queueing is opt-in, per call site. An interceptor that swallowed every failed
 * mutation would also queue a login, a user invitation and a category rename,
 * none of which can be replayed safely hours later.
 */

import { enqueue } from './queue';

/**
 * @param {object}   options
 * @param {string}   options.label   short human description, shown in the pending list
 * @param {string}   options.method  HTTP method used on replay
 * @param {string}   options.url     path used on replay, relative to the API base
 * @param {object}   options.body    request body, without the id
 * @param {Function} options.send    (bodyWithId) => Promise, the ordinary online call
 * @returns {Promise<{ queued: boolean, data?: any }>}
 */
export async function submitOrQueue({ label, method = 'POST', url, body, send }) {
  // Generated before the first attempt and reused by every replay, so the
  // server can recognise a duplicate by primary key.
  const idempotencyKey = crypto.randomUUID();

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    await enqueue({ label, method, url, body, idempotencyKey });
    return { queued: true };
  }

  try {
    return { queued: false, data: await send({ ...body, id: idempotencyKey }) };
  } catch (error) {
    // NETWORK_ERROR is the client's own code for "no response at all", which
    // covers a timeout and a dropped connection. Anything else is an answer
    // from the server and belongs to the caller, not to the queue.
    if (error?.code === 'NETWORK_ERROR') {
      await enqueue({ label, method, url, body, idempotencyKey });
      return { queued: true };
    }
    throw error;
  }
}
