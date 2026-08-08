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

const config = {
  nodeEnv: NODE_ENV,
  isProduction,
  isTest: NODE_ENV === 'test',

  port: Number(optional('PORT', 4000)),

  // Comma-separated allowlist, e.g. "http://localhost:5173,https://sgs.siprocom.com"
  clientUrls: optional('CLIENT_URL', 'http://localhost:5173')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean),

  databaseUrl: optional('DATABASE_URL', ''),

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
};

module.exports = config;
