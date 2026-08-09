'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const config = require('./config/env');
const logger = require('./lib/logger');
const { ForbiddenError } = require('./lib/errors');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const healthRoutes = require('./routes/health.routes');
const authRoutes = require('./routes/auth.routes');
const categoryRoutes = require('./routes/category.routes');
const supplierRoutes = require('./routes/supplier.routes');
const warehouseRoutes = require('./routes/warehouse.routes');
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
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ---- routes -------------------------------------------------------------
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/warehouses', warehouseRoutes);
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
