'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { rateLimit } = require('express-rate-limit');

const config = require('./config/env');
const logger = require('./lib/logger');
const { ForbiddenError } = require('./lib/errors');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const healthRoutes = require('./routes/health.routes');
const authRoutes = require('./routes/auth.routes');
const categoryRoutes = require('./routes/category.routes');
const supplierRoutes = require('./routes/supplier.routes');
const productRoutes = require('./routes/product.routes');
const stockRoutes = require('./routes/stock.routes');
const receiptRoutes = require('./routes/receipt.routes');
const issueRoutes = require('./routes/issue.routes');
const alertRoutes = require('./routes/alert.routes');
const reportRoutes = require('./routes/report.routes');
const userRoutes = require('./routes/user.routes');
const auditRoutes = require('./routes/audit.routes');

const app = express();

// Behind Vercel / Nginx: trust the proxy so req.ip and secure cookies work.
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet());

/**
 * In development, Vite falls back to 5174, 5175… whenever the configured port is
 * already taken, and the resulting CORS rejection is baffling to debug from the
 * browser. Any loopback origin is therefore accepted locally; production keeps
 * the strict allowlist, which is where it actually protects anything.
 */
const isLoopbackOrigin = (origin) =>
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(origin);

app.use(
  cors({
    origin(origin, callback) {
      // Same-origin / server-to-server requests carry no Origin header.
      if (!origin || config.clientUrls.includes(origin)) return callback(null, true);
      if (!config.isProduction && isLoopbackOrigin(origin)) return callback(null, true);

      logger.warn({ origin, allowed: config.clientUrls }, 'Blocked by CORS allowlist');
      // A plain Error surfaces as a 500 "Internal server error", which tells the
      // user nothing. Reject with a typed error so the envelope carries a code
      // the client can actually translate.
      return callback(new ForbiddenError('CORS_ORIGIN_NOT_ALLOWED', { origin }));
    },
    credentials: true, // required for the httpOnly auth cookie
  })
);

app.use(express.json({ limit: '1mb' }));

/**
 * express.urlencoded is deliberately absent, and this is a CSRF control rather
 * than tidying.
 *
 * The auth cookie is SameSite=None in production, because the client and the
 * API may sit on different domains. The browser therefore sends it on
 * cross-site requests. CORS does not help here: a form POST with
 * application/x-www-form-urlencoded is a "simple request", so it is dispatched
 * with no preflight, and the allowlist only stops the attacker reading the
 * reply - not the write from happening.
 *
 * With only the JSON parser mounted, such a body never parses, req.body stays
 * empty and zod rejects it before any service runs. A cross-site request
 * carrying application/json does get preflighted, and there the allowlist bites.
 *
 * Nothing in this API has ever accepted a form: the client sends JSON. Mounting
 * the parser cost nothing visible and opened the one door CORS cannot close.
 */

app.use(cookieParser());

/**
 * Blanket ceiling on the whole API.
 *
 * The auth routes have their own, much tighter limits; this is the backstop for
 * everything behind a valid session. The report endpoints run several
 * aggregates over the movement ledger, and one stolen cookie or one runaway
 * script should not be able to drive the database into the ground.
 *
 * Generous on purpose: a magasinier working quickly through receipts fires a
 * lot of small requests, and a limiter that trips on ordinary work gets raised
 * until it means nothing.
 */
app.use(
  '/api',
  rateLimit({
    windowMs: 60 * 1000,
    limit: 300,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // Health checks must answer even while something else is being throttled.
    skip: (req) => req.path.startsWith('/health'),
  })
);

// ---- routes -------------------------------------------------------------
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/products', productRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/receipts', receiptRoutes);
app.use('/api/issues', issueRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/users', userRoutes);
app.use('/api/audit-logs', auditRoutes);
// app.use('/api/alerts', alertRoutes);         // Phase 5
// app.use('/api/reports', reportRoutes);       // Phase 6

// ---- error handling (must stay last) ------------------------------------
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
