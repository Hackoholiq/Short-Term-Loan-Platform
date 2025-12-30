const express = require('express');
const router = express.Router();

const auth = require('../middleware/auth');
const isAdmin = require('../middleware/isAdmin');

const {
  getAllLoans,
  approveLoan,
  getAllUsers,
  getUserTransactions,
  getReports,
  promoteToAdmin,
  promoteUser
} = require('../controllers/adminController');

// Loans
router.get('/loans', auth, isAdmin, getAllLoans);
router.put('/loans/:id/approve', auth, isAdmin, approveLoan);

// Users
router.get('/users', auth, isAdmin, getAllUsers);
router.put('/users/:userId/promote', auth, isAdmin, promoteToAdmin);

// Promote by email or userId (your existing promoteUser handler expects userId in body)
// If you want promote-by-email, we can adjust controller later.
router.post('/promote', auth, isAdmin, promoteUser);

// Transactions / Reports
router.get('/users/:userId/transactions', auth, isAdmin, getUserTransactions);
router.get('/reports', auth, isAdmin, getReports);

module.exports = router;