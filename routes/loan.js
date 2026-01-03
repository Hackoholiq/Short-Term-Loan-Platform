const express = require('express');
const router = express.Router();

const auth = require('../middleware/auth');
const { body, param, query, validationResult } = require('express-validator');

const {
  applyForLoan,
  getLoansByUser,
  checkPreApproval,
  makePayment,
} = require('../controllers/loanController');

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
   PRE-APPROVAL
========================= */
router.get('/pre-approval', auth, checkPreApproval);

/* =========================
   APPLY FOR LOAN
   POST /api/loan/apply
========================= */
router.post(
  '/apply',
  auth,
  [
    body('loan_amount').isNumeric().withMessage('Loan amount must be a number'),
    body('interest_rate').isNumeric().withMessage('Interest rate must be a number'),
    body('duration').isNumeric().withMessage('Duration must be a number'),
    body('repayment_date').isISO8601().withMessage('Repayment date must be a valid date'),
  ],
  validate,
  applyForLoan
);

/* =========================
   MY LOANS
   GET /api/loan/my-loans?page=1&limit=10
========================= */
router.get(
  '/my-loans',
  auth,
  [
    query('page').optional().isInt({ min: 1 }).withMessage('page must be >= 1'),
    query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('limit must be 1-50'),
  ],
  validate,
  getLoansByUser
);

/* =========================
   PAY LOAN (MAKE PAYMENT)
   POST /api/loan/:loanId/pay
   body: { amount: number }
========================= */
router.post(
  '/:loanId/pay',
  auth,
  [
    param('loanId').isMongoId().withMessage('Invalid loan id'),
    body('amount').isNumeric().withMessage('amount must be a number'),
    body('amount').custom((val) => {
      if (Number(val) <= 0) throw new Error('amount must be greater than 0');
      return true;
    }),
  ],
  validate,
  makePayment
);

module.exports = router;