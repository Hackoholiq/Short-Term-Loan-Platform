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
  promoteToAdmin
} = require('../controllers/adminController');

// ================= LOANS =================
router.get('/loans', auth, isAdmin, getAllLoans);
router.put('/loans/:id/approve', auth, isAdmin, approveLoan);

// ================= USERS =================
router.get('/users', auth, isAdmin, getAllUsers);
router.put('/users/:userId/promote', auth, isAdmin, promoteToAdmin);
router.get('/users/:userId/transactions', auth, isAdmin, getUserTransactions);

// ================= REPORTS =================
router.get('/reports', auth, isAdmin, getReports);

module.exports = router;