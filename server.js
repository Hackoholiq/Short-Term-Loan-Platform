const express = require('express');
const connectDB = require('./config/db');
const authRoutes = require('./routes/auth');
const loanRoutes = require('./routes/loan');
const adminRoutes = require('./routes/admin');
const kycRoutes = require('./routes/kyc'); // NEW: KYC routes
const adminKYCRoutes = require('./routes/adminKYC');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const morgan = require('morgan');
const { requireKYC } = require('./middleware/kycMiddleware'); // NEW: KYC middleware
require('dotenv').config();

const app = express();

// ========== CRITICAL FIX: TRUST PROXY ==========
// Fix for the "X-Forwarded-For" error you saw in logs
app.set('trust proxy', 1); // Trust first proxy (Render's load balancer)

// Connect to DB
connectDB();

// ========== RATE LIMITING SETUP (Updated for KYC) ==========
// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  message: {
    status: 'error',
    message: 'Too many requests from this IP, please try again after 15 minutes'
  },
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false, // Disable the X-RateLimit-* headers
  skip: (req) => {
    // Skip rate limiting for KYC document uploads (large files)
    return req.path.includes('/kyc/documents/upload');
  }
});

// Stricter limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Stricter limit for login/register
  message: {
    status: 'error', 
    message: 'Too many login attempts, please try again after 15 minutes'
  },
  skipSuccessfulRequests: true, // Don't count successful logins against limit
});

// Special limiter for KYC submissions (prevent spam)
const kycLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Only 3 KYC submissions per hour
  message: {
    status: 'error',
    message: 'Too many KYC verification attempts. Please wait 1 hour.'
  },
  keyGenerator: (req) => {
    // Rate limit by user ID, not IP (for better UX)
    return req.user ? req.user.id : req.ip;
  }
});

// Mount routes
app.use('/api/admin', adminRoutes);
app.use('/api/admin', adminKYCRoutes); // Note: Same base path
app.use('/api/kyc', kycRoutes);

// ========== MIDDLEWARE ==========
app.use(express.json({ limit: '10mb' })); // Increased for document uploads
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cors({ 
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true 
}));
app.use(helmet());
app.use(morgan('dev'));

// ========== APPLY RATE LIMITERS ==========
// Apply general limiter to ALL routes
app.use(apiLimiter);

// Apply stricter limiters to specific routes
app.use('/auth', authLimiter);
app.use('/kyc/submit', kycLimiter); // NEW: KYC submission rate limiting

// ========== KYC PROTECTED ROUTES SETUP ==========
// Create wrapper function to dynamically apply KYC middleware based on loan amount
const withKYCCheck = (loanAmount) => {
  // Determine required KYC level based on loan amount
  let requiredLevel = 'none';
  if (loanAmount > 5000) requiredLevel = 'enhanced';
  else if (loanAmount > 1000) requiredLevel = 'basic';
  
  // Return middleware chain
  return requiredLevel !== 'none' 
    ? [requireKYC(requiredLevel)]
    : [];
};

// ========== ROUTES ==========
app.use('/auth', authRoutes);
app.use('/loan', loanRoutes);
app.use('/admin', adminRoutes);
app.use('/kyc', kycRoutes); // NEW: KYC routes
app.use('/api/kyc', kycRoutes);

// ========== HEALTH CHECK (Enhanced) ==========
app.get('/health', (req, res) => {
  const healthStatus = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'Loan Management API',
    version: '1.0.0',
    features: {
      kyc: true, // NEW: Indicate KYC feature is active
      rate_limiting: true,
      admin_dashboard: true,
      proxy_trust: app.get('trust proxy') ? 'configured' : 'not_configured'
    }
  };
  res.status(200).json(healthStatus);
});

// ========== KYC STATUS CHECK ENDPOINT ==========
// Public endpoint to check if KYC is required for a loan amount
app.get('/kyc/requirements/:amount', (req, res) => {
  const loanAmount = parseFloat(req.params.amount) || 0;
  
  let requirement = {
    required: false,
    level: 'none',
    message: 'No KYC required'
  };
  
  if (loanAmount > 5000) {
    requirement = {
      required: true,
      level: 'enhanced',
      message: 'Enhanced KYC required for loans above $5,000'
    };
  } else if (loanAmount > 1000) {
    requirement = {
      required: true,
      level: 'basic',
      message: 'Basic KYC required for loans $1,001 - $5,000'
    };
  }
  
  res.json(requirement);
});

// ========== ERROR HANDLING (Enhanced for KYC) ==========
// 404 Handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    status: 'error',
    message: `Route ${req.originalUrl} not found`,
    suggestedRoutes: [
      { method: 'POST', path: '/loan/apply', description: 'Apply for a loan' },
      { method: 'POST', path: '/kyc/documents/upload', description: 'Upload KYC documents' },
      { method: 'GET', path: '/kyc/status', description: 'Check KYC status' }
    ]
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  
  // Handle specific error types
  const errorHandlers = {
    'KYC_VERIFICATION_REQUIRED': {
      status: 403,
      message: err.message || 'KYC verification required',
      code: err.code,
      requiredLevel: err.requiredLevel,
      currentStatus: err.currentStatus,
      redirectTo: '/kyc/verify'
    },
    '429': { // Rate limit
      status: 429,
      message: err.message || 'Too many requests'
    },
    'MongoError': { // Database errors
      status: 500,
      message: 'Database error occurred'
    },
    'default': {
      status: err.status || 500,
      message: err.message || 'Internal server error'
    }
  };
  
  const handler = errorHandlers[err.code] || errorHandlers[err.status] || errorHandlers[err.name] || errorHandlers['default'];
  
  res.status(handler.status).json({
    status: 'error',
    message: handler.message,
    ...(handler.code && { code: handler.code }),
    ...(handler.requiredLevel && { requiredLevel: handler.requiredLevel }),
    ...(handler.currentStatus && { currentStatus: handler.currentStatus }),
    ...(handler.redirectTo && { redirectTo: handler.redirectTo }),
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🌐 Health check: http://localhost:${PORT}/health`);
  console.log(`📊 Rate limits: 100 req/15min (general), 5 req/15min (auth), 3 req/hour (KYC)`);
  console.log(`🔒 Trust proxy: ${app.get('trust proxy') ? 'ENABLED' : 'DISABLED'}`);
  console.log(`👤 KYC System: ${kycRoutes ? 'ENABLED' : 'DISABLED'}`);
  
  // Log KYC feature status
  if (kycRoutes) {
    console.log(`📋 KYC Routes:`);
    console.log(`   POST /kyc/documents/upload - Upload KYC documents`);
    console.log(`   POST /kyc/submit - Submit for verification`);
    console.log(`   GET  /kyc/status - Check KYC status`);
    console.log(`   GET  /kyc/requirements/:amount - Check KYC requirement for loan amount`);
  }
});

// Allow CORS from frontend
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token']
}));