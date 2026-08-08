'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const config = require('./config/env');
const logger = require('./lib/logger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const healthRoutes = require('./routes/health.routes');
const authRoutes = require('./routes/auth.routes');
const categoryRoutes = require('./routes/category.routes');
const supplierRoutes = require('./routes/supplier.routes');
const warehouseRoutes = require('./routes/warehouse.routes');
const productRoutes = require('./routes/product.routes');

const app = express();

// Behind Vercel / Nginx: trust the proxy so req.ip and secure cookies work.
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet());

app.use(
  cors({
    origin(origin, callback) {
      // Same-origin / server-to-server requests carry no Origin header.
      if (!origin || config.clientUrls.includes(origin)) return callback(null, true);
      logger.warn({ origin }, 'Blocked by CORS allowlist');
      return callback(new Error('NOT_ALLOWED_BY_CORS'));
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

// Feature routers are mounted here as each phase lands:
// app.use('/api/stock', stockRoutes);          // Phase 3
// app.use('/api/alerts', alertRoutes);         // Phase 5
// app.use('/api/reports', reportRoutes);       // Phase 6

// ---- error handling (must stay last) ------------------------------------
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
