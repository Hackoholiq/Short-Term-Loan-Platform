const express = require('express');
const connectDB = require('./config/db');
const authRoutes = require('./routes/auth');
const loanRoutes = require('./routes/loan');
const adminRoutes = require('./routes/admin');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const app = express();

// Connect to DB
connectDB();

// ========== RATE LIMITING SETUP ==========
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

// ========== MIDDLEWARE ==========
app.use(express.json());
app.use(cors({ 
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000', // Make configurable
  credentials: true 
}));
app.use(helmet());
app.use(morgan('dev'));

// ========== APPLY RATE LIMITERS ==========
// Apply general limiter to ALL routes
app.use(apiLimiter);

// Apply stricter limiter specifically to auth routes
app.use('/auth', authLimiter);

// ========== ROUTES ==========
app.use('/auth', authRoutes);
app.use('/loan', loanRoutes);
app.use('/admin', adminRoutes);

// ========== HEALTH CHECK ==========
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'Loan Management API'
  });
});

// ========== ERROR HANDLING ==========
// 404 Handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    status: 'error',
    message: `Route ${req.originalUrl} not found` 
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  
  // Handle rate limit errors specifically
  if (err.status === 429) {
    return res.status(429).json({
      status: 'error',
      message: err.message || 'Too many requests'
    });
  }
  
  res.status(err.status || 500).json({ 
    status: 'error',
    message: err.message || 'Internal server error' 
  });
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🌐 Health check: http://localhost:${PORT}/health`);
  console.log(`📊 Rate limits: 100 req/15min (general), 5 req/15min (auth)`);
});