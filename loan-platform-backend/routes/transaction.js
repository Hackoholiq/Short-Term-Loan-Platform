const express = require('express');
const router = express.Router();
const { recordTransaction, getTransactionsByUser } = require('../controllers/transactionController');
const auth = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

// Record a transaction (e.g. repayment/disbursement)
router.post(
  '/record',
  auth,
  [
    body('amount').isNumeric().withMessage('Amount must be a number'),
    body('type').isIn(['payment', 'refund']).withMessage('Invalid transaction type'),
    body('loan_id').notEmpty().withMessage('Loan ID is required'),
  ],
  recordTransaction
);

// Get all transactions for the authenticated user
router.get('/my-transactions', auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1; // Default to page 1
    const limit = parseInt(req.query.limit) || 10; // Default to 10 transactions per page
    const skip = (page - 1) * limit;

    const transactions = await Transaction.find({ user_id: req.user.id })
      .skip(skip)
      .limit(limit);

    res.json(transactions);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

module.exports = router;