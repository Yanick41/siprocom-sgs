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

/** In production these are fatal; in development a sensible default is fine. */
const requiredInProduction = (key, devFallback) =>
  isProduction ? required(key) : optional(key, devFallback);

const clientUrls = requiredInProduction('CLIENT_URL', 'http://localhost:5280')
  .split(',')
  .map((url) => url.trim())
  .filter(Boolean);

// A localhost origin in a production allowlist is almost always a copied dev
// value, and it hands the CORS allowlist to anything running on the operator's
// machine. Refuse to boot rather than serve with it.
if (isProduction && clientUrls.some((url) => /localhost|127\.0\.0\.1|\[::1\]/.test(url))) {
  throw new Error(
    `CLIENT_URL contains a localhost origin in production: ${clientUrls.join(', ')}. ` +
      'Set it to the real front-end domain(s).'
  );
}

if (isProduction && clientUrls.some((url) => url.startsWith('http://'))) {
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
