const express = require('express');
const router = express.Router();
const { recordTransaction, getTransactionsByUser } = require('../controllers/transactionController');
const auth = require('../middleware/auth');  // Middleware to protect routes

// Record a transaction (e.g. repayment/disbursement)
router.post('/record', auth, recordTransaction);

// Get all transactions for the authenticated user
router.get('/my-transactions', auth, getTransactionsByUser);

module.exports = router;
