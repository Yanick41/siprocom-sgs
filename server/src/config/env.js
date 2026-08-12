'use strict';

require('dotenv').config();

/**
 * Centralised, validated environment access.
 * Fail fast at boot rather than at the first request that needs a missing var.
 */
const required = (key) => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

const optional = (key, fallback) => process.env[key] ?? fallback;

const NODE_ENV = optional('NODE_ENV', 'development');
const isProduction = NODE_ENV === 'production';

/**
 * Vercel publishes the stable production domain of the project at runtime, so
 * the CORS allowlist can be correct on the very first deploy instead of needing
 * CLIENT_URL corrected and the whole thing redeployed once the URL is known.
 *
 * It is the project's production alias (siprocom-sgs.vercel.app), not the
 * per-deployment URL, so it does not change with every push. Preview
 * deployments each get their own hostname and are not covered — deliberately:
 * an allowlist that accepts any *.vercel.app accepts everyone else's too.
 */
const vercelProductionOrigin = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : null;

/**
 * An empty allowlist is not a failure, so this must never throw.
 *
 * The earlier version required CLIENT_URL in production unless Vercel supplied
 * the domain — which made boot depend on VERCEL_PROJECT_PRODUCTION_URL, a
 * system variable the platform only exposes when that option is enabled. When
 * it was not, the module threw while loading and every request returned
 * FUNCTION_INVOCATION_FAILED: no route ran, so even /api/health could not
 * report what was wrong.
 *
 * The reasoning behind it was wrong anyway. On Vercel the SPA and the API share
 * an origin, so the browser sends no Origin header for the app's own requests
 * and CORS never applies. An empty allowlist blocks cross-origin callers and
 * leaves the deployed application working — the safe default, and the one that
 * cannot take the whole service down.
 */
const configuredClientUrl = optional('CLIENT_URL', '') || vercelProductionOrigin || '';

const clientUrls = [
  ...configuredClientUrl.split(',').map((url) => url.trim()).filter(Boolean),
  ...(vercelProductionOrigin ? [vercelProductionOrigin] : []),
  ...(isProduction ? [] : ['http://localhost:5280']),
].filter((url, index, all) => all.indexOf(url) === index);

/**
 * These reject a bad value; they must not reject the absence of one.
 *
 * A localhost origin in production is almost always a copied dev value and
 * hands the allowlist to anything running on the operator's machine. Plain http
 * is equally useless: the auth cookie is Secure, so a browser would never send
 * it. Both are worth refusing to boot over — but only when someone actually set
 * them, which is why the guards run on `configuredClientUrl` rather than on the
 * assembled list.
 */
const badOrigins = configuredClientUrl
  .split(',')
  .map((url) => url.trim())
  .filter(Boolean);

if (isProduction && badOrigins.some((url) => /localhost|127\.0\.0\.1|\[::1\]/.test(url))) {
  throw new Error(
    `CLIENT_URL contains a localhost origin in production: ${badOrigins.join(', ')}. ` +
      'Set it to the real front-end domain(s), or leave it unset — the app and ' +
      'the API share an origin, so CORS is not needed for the app itself.'
  );
}

if (isProduction && badOrigins.some((url) => url.startsWith('http://'))) {
  throw new Error(
    'CLIENT_URL must use https in production — the auth cookie is Secure and a ' +
      'browser will not send it over http.'
  );
}

const config = {
  nodeEnv: NODE_ENV,
  isProduction,
  isTest: NODE_ENV === 'test',

  port: Number(optional('PORT', 4000)),

  // Comma-separated allowlist, e.g. "https://sgs.siprocom.com,https://www.sgs.siprocom.com"
  clientUrls,

  // Prisma would fail later anyway; failing here names the cause.
  databaseUrl: required('DATABASE_URL'),

  jwt: {
    // In production a weak/absent secret is fatal; in dev we allow a throwaway value.
    secret: isProduction ? required('JWT_SECRET') : optional('JWT_SECRET', 'dev-only-insecure-secret'),
    expiresIn: optional('JWT_EXPIRES_IN', '8h'),
    cookieName: optional('JWT_COOKIE_NAME', 'sgs_token'),
  },

  bcryptRounds: Number(optional('BCRYPT_ROUNDS', 10)),

  logLevel: optional('LOG_LEVEL', isProduction ? 'info' : 'debug'),

  // Protects the internal cron endpoints (alert sweep).
  cronSecret: optional('CRON_SECRET', ''),

  mail: {
    apiKey: optional('RESEND_API_KEY', ''),
    from: optional('MAIL_FROM', 'SIPROCOM SGS <noreply@siprocom.local>'),
    enabled: Boolean(optional('RESEND_API_KEY', '')),
  },

  defaultLocale: optional('DEFAULT_LOCALE', 'fr'),

  // In-process daily sweep. Off by default: on a multi-instance deployment every
  // instance would otherwise run the same sweep at the same minute.
  enableScheduler: optional('ENABLE_SCHEDULER', 'false') === 'true',
  timezone: optional('TZ', 'Africa/Abidjan'),
};

// Warnings, not failures — the system works without these, just with a feature
// silently inert, which is worth saying out loud at boot.
if (isProduction) {
  const warnings = [];
  if (!config.cronSecret) {
    warnings.push('CRON_SECRET is empty — POST /api/alerts/sweep will reject every call.');
  }
  if (!config.mail.enabled) {
    warnings.push('RESEND_API_KEY is empty — email alerts are disabled (dashboard alerts still work).');
  }
  if (config.jwt.secret.length < 32) {
    warnings.push('JWT_SECRET is shorter than 32 characters — generate a longer one.');
  }
  if (warnings.length) {
    // eslint-disable-next-line no-console -- the logger imports this module
    console.warn(`[SGS] Production configuration warnings:\n  - ${warnings.join('\n  - ')}`);
  }
}

module.exports = config;
