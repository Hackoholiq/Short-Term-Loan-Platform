const express = require('express');
const router = express.Router();
const { applyForLoan, getLoansByUser } = require('../controllers/loanController');
const auth = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

// @route   POST /loan/apply
// @desc    Apply for a loan
// @access  Private (user needs to be logged in)
router.post(
  '/apply',
  auth,
  [
    body('loan_amount').isNumeric().withMessage('Loan amount must be a number'),
    body('interest_rate').isNumeric().withMessage('Interest rate must be a number'),
    body('duration').isNumeric().withMessage('Duration must be a number'),
    body('repayment_date').isISO8601().withMessage('Repayment date must be a valid date'),
  ],
  applyForLoan
);

// @route   GET /loan/my-loans
// @desc    Get all loans for the authenticated user
// @access  Private
router.get('/my-loans', auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1; // Default to page 1
    const limit = parseInt(req.query.limit) || 10; // Default to 10 loans per page
    const skip = (page - 1) * limit;

    const loans = await Loan.find({ user_id: req.user.id })
      .skip(skip)
      .limit(limit);

    res.json(loans);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

module.exports = router;