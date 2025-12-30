const express = require('express');
const router = express.Router();

const { body, param, query, validationResult } = require('express-validator');

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
  getAuditLogs,
} = require('../controllers/adminController');

/* =========================
   VALIDATION MIDDLEWARE
========================= */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ msg: errors.array()[0].msg });
  }
  next();
};

/* =========================
   LOANS
========================= */

// GET /api/admin/loans?status=pending|approved|rejected
router.get(
  '/loans',
  auth,
  isAdmin,
  [
    query('status')
      .optional()
      .isIn(['pending', 'approved', 'rejected'])
      .withMessage("status must be one of: pending, approved, rejected"),
  ],
  validate,
  getAllLoans
);

// PUT /api/admin/loans/:id/approve   body: { status: "approved" | "rejected" }
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

// GET /api/admin/users
router.get('/users', auth, isAdmin, getAllUsers);

// PUT /api/admin/users/:userId/promote
router.put(
  '/users/:userId/promote',
  auth,
  isAdmin,
  [param('userId').isMongoId().withMessage('Invalid user id')],
  validate,
  promoteToAdmin
);

// POST /api/admin/promote
// body: { email: "x@y.com" } OR { userId: "<mongoId>" }
router.post(
  '/promote',
  auth,
  isAdmin,
  [
    body().custom((_, { req }) => {
      const email = String(req.body?.email || '').trim();
      const userId = String(req.body?.userId || '').trim();
      if (!email && !userId) throw new Error('Provide either email or userId');
      return true;
    }),

    body('email')
      .optional({ nullable: true })
      .isEmail()
      .withMessage('Invalid email address')
      .normalizeEmail(),

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

// GET /api/admin/users/:userId/transactions
router.get(
  '/users/:userId/transactions',
  auth,
  isAdmin,
  [param('userId').isMongoId().withMessage('Invalid user id')],
  validate,
  getUserTransactions
);

// GET /api/admin/reports
router.get('/reports', auth, isAdmin, getReports);

/* =========================
   AUDIT LOGS
========================= */

// GET /api/admin/audit-logs?page=1&limit=25&status=success&action=...
router.get(
  '/audit-logs',
  auth,
  isAdmin,
  [
    query('page').optional().isInt({ min: 1 }).withMessage('page must be >= 1'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 200 })
      .withMessage('limit must be 1-200'),
    query('action').optional().isString().trim(),
    query('status')
      .optional()
      .isIn(['success', 'fail'])
      .withMessage("status must be 'success' or 'fail'"),
    query('actorId').optional().isMongoId().withMessage('Invalid actorId'),
    query('targetId').optional().isMongoId().withMessage('Invalid targetId'),
    query('targetType').optional().isString().trim(),
  ],
  validate,
  getAuditLogs
);

module.exports = router;