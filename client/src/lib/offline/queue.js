/**
 * The offline write queue.
 *
 * A stock movement recorded on a device with no network is an *intent*, not a
 * fact. The server stays the only authority on stock: BR-2's conditional
 * decrement cannot be evaluated on a disconnected phone, so nothing here
 * pretends to know whether a sortie will succeed. Entries are held verbatim
 * and replayed in order; the server accepts or refuses each one for the same
 * reasons it would have at the time.
 *
 * IndexedDB rather than localStorage: this has to survive a browser kill, and
 * localStorage is synchronous and capped at ~5MB shared with everything else.
 *
 * Ordering is strict FIFO by `seq`. Two sorties of the same product must reach
 * the server in the order they were entered, otherwise the second can be
 * refused for lack of stock the first was going to consume.
 */

const DB_NAME = 'sgs-offline';
const DB_VERSION = 1;
const STORE = 'pending';

/** A queued entry is one of these; anything else is a bug, not a request. */
export const STATUS = {
  PENDING: 'pending',
  /** The server refused it on its merits. Needs a person. */
  CONFLICT: 'conflict',
};

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('seq', 'seq');
        store.createIndex('status', 'status');
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

function tx(mode, run) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const store = transaction.objectStore(STORE);
        let result;
        try {
          result = run(store);
        } catch (error) {
          reject(error);
          return;
        }
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      })
  );
}

const request = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

/**
 * Monotonic within a device. Date.now() alone collides when two entries are
 * saved in the same millisecond, which is exactly what happens when someone
 * taps through a document quickly.
 */
let lastSeq = 0;
function nextSeq() {
  const now = Date.now();
  lastSeq = now > lastSeq ? now : lastSeq + 1;
  return lastSeq;
}

/**
 * Adds an intent to the queue.
 *
 * `idempotencyKey` is the id the server will give the row it creates. It is
 * generated here, once, and reused on every replay attempt: if a replay
 * succeeds but the response is lost on the way back, the retry collides on the
 * primary key and the server answers with the existing record instead of
 * writing a second one. That is what stops a flaky connection from posting the
 * same sortie twice.
 */
export async function enqueue({ label, method, url, body, idempotencyKey }) {
  const entry = {
    id: crypto.randomUUID(),
    seq: nextSeq(),
    label,
    method,
    url,
    body,
    idempotencyKey: idempotencyKey ?? crypto.randomUUID(),
    status: STATUS.PENDING,
    attempts: 0,
    lastError: null,
    createdAt: new Date().toISOString(),
  };

  await tx('readwrite', (store) => store.add(entry));
  notify();
  return entry;
}

/** Everything still waiting, oldest first. */
export async function listPending() {
  const all = await tx('readonly', (store) => request(store.getAll()));
  return all.filter((e) => e.status === STATUS.PENDING).sort((a, b) => a.seq - b.seq);
}

/** Entries the server refused. These need a person, not another retry. */
export async function listConflicts() {
  const all = await tx('readonly', (store) => request(store.getAll()));
  return all.filter((e) => e.status === STATUS.CONFLICT).sort((a, b) => a.seq - b.seq);
}

export async function counts() {
  const all = await tx('readonly', (store) => request(store.getAll()));
  return {
    pending: all.filter((e) => e.status === STATUS.PENDING).length,
    conflicts: all.filter((e) => e.status === STATUS.CONFLICT).length,
  };
}

export async function remove(id) {
  await tx('readwrite', (store) => store.delete(id));
  notify();
}

export async function update(id, patch) {
  await tx('readwrite', (store) => {
    const req = store.get(id);
    req.onsuccess = () => {
      if (req.result) store.put({ ...req.result, ...patch });
    };
  });
  notify();
}

/** Drops every refused entry. Used by the conflict screen's "discard all". */
export async function clearConflicts() {
  const conflicts = await listConflicts();
  await tx('readwrite', (store) => {
    for (const entry of conflicts) store.delete(entry.id);
  });
  notify();
}

// ---- change notification -------------------------------------------------

/**
 * The badge in the header has to move the moment something is queued or
 * flushed. A plain event target is enough: this is one tab talking to itself.
 */
const listeners = new Set();

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* a broken listener must not stop the others */
    }
  }
}
