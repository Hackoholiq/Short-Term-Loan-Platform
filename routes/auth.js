const express = require('express');
const router = express.Router();
const { register, login } = require('../controllers/authController');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,                 // 10 attempts
  skipSuccessfulRequests: true, // only count failed logins
  standardHeaders: true,
  legacyHeaders: false,
  message: { msg: 'Too many login attempts. Please try again later.' },
});

// @route   POST /auth/register
// @desc    Register a new user
// @access  Public
router.post(
  '/register',
  [
    body('first_name').notEmpty().withMessage('First name is required'),
    body('last_name').notEmpty().withMessage('Last name is required'),
    body('email').isEmail().withMessage('Invalid email address'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),
  ],
  register
);

// @route   POST /auth/login
// @desc    Login a user
// @access  Public
router.post(
  '/login',
  loginLimiter,
  [
    body('email').isEmail().withMessage('Invalid email address'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  login
);

module.exports = router;