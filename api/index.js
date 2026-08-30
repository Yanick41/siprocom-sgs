'use strict';

/**
 * Vercel serverless entry point.
 *
 * Vercel only turns files inside `api/` into functions - a path named under the
 * `functions` key in vercel.json is configured, not created. Without this file
 * every /api/* request 404s while the front-end deploys perfectly.
 *
 * The import is guarded because a throw at module load produces
 * FUNCTION_INVOCATION_FAILED with an empty body: no route runs, so even
 * /api/health cannot say what happened, and the only way to find out is the
 * platform's log viewer. Catching it turns a silent crash into a readable
 * answer over HTTP.
 *
 * The message is deliberate: a boot failure here is a missing environment
 * variable or an absent Prisma engine, not user input, so naming it leaks
 * nothing an operator does not already need to know. Values are never echoed -
 * only the failure itself.
 */
let app;
let bootError = null;

try {
  app = require('../server/index.js');
} catch (error) {
  bootError = error;
  console.error('[SGS] Boot failed:', error);
}

module.exports = (req, res) => {
  if (!bootError) return app(req, res);

  res.statusCode = 500;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(
    JSON.stringify({
      error: {
        code: 'BOOT_FAILED',
        message: bootError.message,
        hint:
          'The API could not start. Check the Production environment variables: ' +
          'DATABASE_URL, DIRECT_URL and JWT_SECRET are required.',
      },
    })
  );
};
