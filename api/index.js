'use strict';

/**
 * Vercel serverless entry point.
 *
 * Vercel only turns files inside `api/` into functions — a path named under the
 * `functions` key in vercel.json is configured, not created. Without this file
 * every /api/* request 404s while the front-end deploys perfectly, which looks
 * like a CORS or routing fault and is neither.
 *
 * The Express app is imported rather than duplicated: server/index.js already
 * skips `listen()` when process.env.VERCEL is set, so the same file serves both
 * a long-running process and a serverless invocation.
 */
module.exports = require('../server/index.js');
