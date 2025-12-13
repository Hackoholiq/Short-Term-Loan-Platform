const express = require('express');
const router = express.Router();
const { applyForLoan, getLoansByUser, checkPreApproval } = require('../controllers/loanController'); // Import checkPreApproval
const auth = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

/**
 * @swagger
 * /loan/pre-approval:
 *   get:
 *     summary: Check if the user is pre-approved for a loan
 *     description: Checks if the user meets the criteria for loan pre-approval.
 *     tags: [Loans]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Pre-approval status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 isPreApproved:
 *                   type: boolean
 *                   example: true
 *       500:
 *         description: Server error
 */
router.get('/pre-approval', auth, checkPreApproval);

/**
 * @swagger
 * /loan/apply:
 *   post:
 *     summary: Apply for a loan
 *     description: Allows a user to apply for a loan.
 *     tags: [Loans]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               loan_amount:
 *                 type: number
 *                 example: 1000
 *               interest_rate:
 *                 type: number
 *                 example: 5
 *               duration:
 *                 type: number
 *                 example: 12
 *               repayment_date:
 *                 type: string
 *                 format: date
 *                 example: '2023-12-31'
 *     responses:
 *       201:
 *         description: Loan application successful
 *       400:
 *         description: Invalid input
 *       500:
 *         description: Server error
 */
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

/**
 * @swagger
 * /loan/my-loans:
 *   get:
 *     summary: Get all loans for the authenticated user
 *     description: Retrieves a list of loans for the logged-in user.
 *     tags: [Loans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: The page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: The number of loans per page
 *     responses:
 *       200:
 *         description: List of loans
 *       500:
 *         description: Server error
 */
router.get('/my-loans', auth, getLoansByUser);

module.exports = router;