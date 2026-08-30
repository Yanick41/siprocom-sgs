/**
 * The replay rules.
 *
 * These decide whether a stock movement recorded offline reaches the ledger
 * once, twice, or never. The failure modes are all silent: a double-posted
 * sortie looks like a busy day, and an entry dropped on a 401 looks like it
 * was never typed. Nothing in the UI would show either.
 *
 * The queue itself is mocked. What is under test is the decision made about
 * each response, not IndexedDB.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const removed = [];
const updated = [];
let queued = [];

vi.mock('@/lib/offline/queue', () => ({
  STATUS: { PENDING: 'pending', CONFLICT: 'conflict' },
  listPending: () => Promise.resolve(queued),
  remove: (id) => {
    removed.push(id);
    return Promise.resolve();
  },
  update: (id, patch) => {
    updated.push({ id, ...patch });
    return Promise.resolve();
  },
}));

const requestMock = vi.fn();

vi.mock('@/api/client', () => {
  class ApiError extends Error {
    constructor(code, details, status) {
      super(code);
      this.code = code;
      this.details = details;
      this.status = status;
    }
  }
  return { default: { request: (...args) => requestMock(...args) }, ApiError };
});

const { flush } = await import('@/lib/offline/sync');
const { ApiError } = await import('@/api/client');

const entry = (over = {}) => ({
  id: 'e1',
  seq: 1,
  label: 'Bon de sortie',
  method: 'POST',
  url: '/issues',
  body: { reason: 'SALE' },
  idempotencyKey: 'key-1',
  attempts: 0,
  ...over,
});

beforeEach(() => {
  removed.length = 0;
  updated.length = 0;
  queued = [];
  requestMock.mockReset();
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
});

describe('offline replay', () => {
  it('sends the idempotency key as the row id, so a retry cannot post twice', async () => {
    queued = [entry()];
    requestMock.mockResolvedValue({ id: 'key-1' });

    await flush();

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: '/issues',
        data: { reason: 'SALE', id: 'key-1' },
      })
    );
    expect(removed).toEqual(['e1']);
  });

  it('replays in seq order, because a later sortie may depend on an earlier one', async () => {
    queued = [
      entry({ id: 'c', seq: 3, idempotencyKey: 'k3' }),
      entry({ id: 'a', seq: 1, idempotencyKey: 'k1' }),
      entry({ id: 'b', seq: 2, idempotencyKey: 'k2' }),
    ];
    requestMock.mockResolvedValue({});

    await flush();

    expect(requestMock.mock.calls.map(([c]) => c.data.id)).toEqual(['k1', 'k2', 'k3']);
  });

  it('parks a 409 as a conflict and keeps going with the rest', async () => {
    queued = [entry({ id: 'a', seq: 1 }), entry({ id: 'b', seq: 2, idempotencyKey: 'k2' })];
    requestMock
      .mockRejectedValueOnce(new ApiError('INSUFFICIENT_STOCK', undefined, 409))
      .mockResolvedValueOnce({});

    const result = await flush();

    expect(result).toMatchObject({ sent: 1, conflicts: 1 });
    expect(updated).toEqual([
      expect.objectContaining({ id: 'a', status: 'conflict', lastError: 'INSUFFICIENT_STOCK' }),
    ]);
    // The unrelated second document must not be held hostage by the first.
    expect(removed).toEqual(['b']);
  });

  it('keeps a 401 pending: the session expired, the entry is still good', async () => {
    queued = [entry()];
    requestMock.mockRejectedValue(new ApiError('UNAUTHORIZED', undefined, 401));

    const result = await flush();

    expect(result).toMatchObject({ deferred: 1, conflicts: 0 });
    expect(removed).toEqual([]);
    expect(updated[0]).not.toHaveProperty('status');
  });

  it('stops on a network failure rather than burning the queue against a dead link', async () => {
    queued = [entry({ id: 'a', seq: 1 }), entry({ id: 'b', seq: 2 })];
    requestMock.mockRejectedValue(new ApiError('NETWORK_ERROR', undefined, 0));

    const result = await flush();

    expect(result).toMatchObject({ deferred: 1 });
    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(removed).toEqual([]);
  });

  it('does nothing at all while the browser reports no network', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    queued = [entry()];

    const result = await flush();

    expect(result).toEqual({ skipped: true, offline: true });
    expect(requestMock).not.toHaveBeenCalled();
  });
});
