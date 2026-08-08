'use strict';

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 25;

/**
 * Parses common list query params into Prisma arguments.
 *
 * Every list endpoint paginates — the <2s NFR does not survive an unbounded
 * `findMany` once the movement ledger reaches production size.
 *
 * @param {object} query   req.query
 * @param {object} options { sortable: string[], defaultSort: string }
 */
function parseListQuery(query = {}, { sortable = [], defaultSort = 'createdAt' } = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const requestedLimit = Number.parseInt(query.limit, 10) || DEFAULT_LIMIT;
  const limit = Math.min(Math.max(1, requestedLimit), MAX_LIMIT);

  // Only allow sorting on explicitly whitelisted columns — a raw passthrough
  // would let a caller sort on (and therefore probe) any column.
  const sortField = sortable.includes(query.sort) ? query.sort : defaultSort;
  const sortOrder = query.order === 'asc' ? 'asc' : 'desc';

  return {
    page,
    limit,
    skip: (page - 1) * limit,
    take: limit,
    orderBy: { [sortField]: sortOrder },
    search: typeof query.search === 'string' ? query.search.trim() : '',
  };
}

/** Uniform list envelope so the client's DataTable can consume any endpoint. */
function paginated(items, total, { page, limit }) {
  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

module.exports = { parseListQuery, paginated, MAX_LIMIT, DEFAULT_LIMIT };
