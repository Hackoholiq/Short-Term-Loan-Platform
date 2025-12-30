const express = require('express');
const router = express.Router();

const { body, param, validationResult } = require('express-validator');

const auth = require('../middleware/auth');
const isAdmin = require('../middleware/isAdmin');

const {
  getAllLoans,
  approveLoan,
  getAllUsers,
  getUserTransactions,
  getReports,
  promoteToAdmin,
  promoteUser,
} = require('../controllers/adminController');

/* =========================
   VALIDATION MIDDLEWARE
========================= */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // return first error message (cleaner for UI)
    return res.status(400).json({ msg: errors.array()[0].msg });
  }
  next();
};

/* =========================
   LOANS
========================= */

// Get all loans (admin only)
router.get('/loans', auth, isAdmin, getAllLoans);

// Approve / Reject a loan (admin only)
router.put(
  '/loans/:id/approve',
  auth,
  isAdmin,
  [
    param('id').isMongoId().withMessage('Invalid loan id'),
    body('status')
      .isIn(['approved', 'rejected'])
      .withMessage("Status must be 'approved' or 'rejected'"),
  ],
  validate,
  approveLoan
);

/* =========================
   USERS
========================= */

// Get all users (admin only)
router.get('/users', auth, isAdmin, getAllUsers);

// Promote user by ID (admin only)
router.put(
  '/users/:userId/promote',
  auth,
  isAdmin,
  [param('userId').isMongoId().withMessage('Invalid user id')],
  validate,
  promoteToAdmin
);

// Promote by email OR userId (POST /api/admin/promote)
// Supports: { "email": "x@y.com" } OR { "userId": "<mongoId>" }
router.post(
  '/promote',
  auth,
  isAdmin,
  [
    // Require at least one of email or userId
    body().custom((value, { req }) => {
      const { email, userId } = req.body || {};
      if (!email && !userId) {
        throw new Error('Provide either email or userId');
      }
      return true;
    }),

    // Validate email if provided
    body('email')
      .optional({ nullable: true })
      .isEmail()
      .withMessage('Invalid email address')
      .normalizeEmail(),

    // Validate userId if provided
    body('userId')
      .optional({ nullable: true })
      .isMongoId()
      .withMessage('Invalid userId'),
  ],
  validate,
  promoteUser
);

/* =========================
   TRANSACTIONS / REPORTS
========================= */

router.get(
  '/users/:userId/transactions',
  auth,
  isAdmin,
  [param('userId').isMongoId().withMessage('Invalid user id')],
  validate,
  getUserTransactions
);

router.get('/reports', auth, isAdmin, getReports);

module.exports = router;