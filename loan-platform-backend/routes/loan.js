const express = require('express');
const router = express.Router();
const { applyForLoan, getLoansByUser } = require('../controllers/loanController');
const auth = require('../middleware/auth');

// @route   POST /loan/apply
// @desc    Apply for a loan
// @access  Private (user needs to be logged in)
router.post('/apply', auth, applyForLoan);

// @route   GET /loan/my-loans
// @desc    Get all loans for the authenticated user
// @access  Private
router.get('/my-loans', auth, getLoansByUser);

module.exports = router;
