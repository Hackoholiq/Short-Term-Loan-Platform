const express = require('express');
const router = express.Router();
const { 
  getAllLoans, 
  approveLoan, 
  getAllUsers, 
  promoteToAdmin // Import promoteToAdmin here
} = require('../controllers/adminController'); // Import all functions at once
const auth = require('../middleware/auth');
const isAdmin = require('../middleware/isAdmin');

// Get all loans (admin only)
router.get('/loans', auth, isAdmin, getAllLoans);

// Approve or reject a loan (admin only)
router.put('/loans/:id/approve', auth, isAdmin, approveLoan);

// Get all users (admin only)
router.get('/users', auth, isAdmin, getAllUsers);

// Promote a user to admin (admin only)
router.put('/users/:userId/promote', auth, isAdmin, promoteToAdmin);

module.exports = router;

