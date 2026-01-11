// server.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const passwordRoutes = require('./routes/password');

// Database
const connectDB = require('./config/db');

// Routes
const authRoutes = require('./routes/auth');
const loanRoutes = require('./routes/loan');
const adminRoutes = require('./routes/admin');
const adminKYCRoutes = require('./routes/adminKYC');
const kycRoutes = require('./routes/kyc');

const app = express();

/* ================================
   TRUST PROXY (RENDER FIX)
================================ */
app.set('trust proxy', 1);

/* ================================
   DATABASE CONNECTION
================================ */
connectDB();

/* ================================
   GLOBAL MIDDLEWARE
================================ */
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token'],
  })
);

app.use(helmet());
app.use(morgan('dev'));

/* ================================
   RATE LIMITERS
================================ */

// Global API limiter (applies to all routes)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Too many requests. Please try again later.',
  },
  skip: (req) => req.path.includes('/kyc/documents/upload'),
});

// Login limiter: only for login endpoint
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Too many login attempts. Please try again later.',
  },
});

// Optional: general limiter for other auth endpoints (register, etc.)
// Keep it higher than loginLimiter? No—apply it but skip /login to avoid double limit.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Too many auth requests. Please try again later.',
  },
});

// Admin limiter (stricter)
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Too many admin requests. Please try again later.',
  },
});

// KYC limiter (submit endpoint only)
const kycLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Too many KYC submissions. Please wait 1 hour.',
  },
});

/* ================================
   APPLY LIMITERS
================================ */
app.use(apiLimiter);

// Apply login limiter to ONLY login route
app.use('/api/auth/login', loginLimiter);

// Apply authLimiter to other /api/auth routes, but skip /login
app.use('/api/auth', (req, res, next) => {
  if (req.path === '/login') return next();
  return authLimiter(req, res, next);
});

// Apply admin limiter to all admin routes
app.use('/api/admin', adminLimiter);

// Apply KYC limiter to submit endpoint only
app.use('/api/kyc/submit', kycLimiter);

/* ================================
   ROUTES
================================ */
app.use('/api/auth', authRoutes);
app.use('/api/auth', passwordRoutes);

app.use('/api/loan', loanRoutes);

app.use('/api/admin', adminRoutes);
app.use('/api/admin', adminKYCRoutes);

app.use('/api/kyc', kycRoutes);

/* ================================
   HEALTH CHECK
================================ */
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    service: 'Loan Platform API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    features: {
      kyc: true,
      rateLimiting: true,
      admin: true,
    },
  });
});

/* ================================
   KYC REQUIREMENTS CHECK
================================ */
app.get('/api/kyc/requirements/:amount', (req, res) => {
  const amount = parseFloat(req.params.amount) || 0;

  if (amount > 5000) {
    return res.json({
      required: true,
      level: 'enhanced',
      message: 'Enhanced KYC required',
    });
  }

  if (amount > 1000) {
    return res.json({
      required: true,
      level: 'basic',
      message: 'Basic KYC required',
    });
  }

  res.json({
    required: false,
    level: 'none',
    message: 'No KYC required',
  });
});

/* ================================
   KYC REQUIREMENTS CHECK (query)
   GET /api/kyc/requirements?amount=5000
================================ */
app.get('/api/kyc/requirements', (req, res) => {
  const amount = parseFloat(req.query.amount) || 0;

  if (amount > 5000) {
    return res.json({
      required: true,
      level: 'enhanced',
      message: 'Enhanced KYC required',
    });
  }

  if (amount > 1000) {
    return res.json({
      required: true,
      level: 'basic',
      message: 'Basic KYC required',
    });
  }

  return res.json({
    required: false,
    level: 'none',
    message: 'No KYC required',
  });
});

/* ================================
   404 HANDLER
================================ */
app.use('*', (req, res) => {
  res.status(404).json({
    status: 'error',
    message: `Route ${req.originalUrl} not found`,
    suggestedRoutes: [
      { method: 'POST', path: '/api/loan/apply' },
      { method: 'POST', path: '/api/kyc/documents/upload' },
      { method: 'GET', path: '/api/kyc/status' },
    ],
  });
});

/* ================================
   GLOBAL ERROR HANDLER
================================ */
app.use((err, req, res, next) => {
  console.error('🔥 Error:', err);

  res.status(err.status || 500).json({
    status: 'error',
    message: err.message || 'Internal Server Error',
    timestamp: new Date().toISOString(),
  });
});

/* ================================
   SERVER START
================================ */
const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🌐 Health check: http://localhost:${PORT}/health`);
  console.log(`🔐 KYC System: ENABLED`);
});