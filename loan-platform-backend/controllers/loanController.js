const Loan = require('../models/Loan');
const { body, validationResult } = require('express-validator');
const logger = require('../config/logger'); // Assuming you have a logger setup

// Apply for a loan
exports.applyForLoan = [
  // Validate input
  body('loan_amount').isNumeric().withMessage('Loan amount must be a number'),
  body('interest_rate').isNumeric().withMessage('Interest rate must be a number'),
  body('duration').isNumeric().withMessage('Duration must be a number'),
  body('repayment_date').isISO8601().withMessage('Repayment date must be a valid date'),

  async (req, res) => {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn(`Validation errors: ${JSON.stringify(errors.array())}`);
      return res.status(400).json({ errors: errors.array() });
    }

    const { loan_amount, interest_rate, duration, repayment_date } = req.body;

    try {
      // Log the loan application request
      logger.info(`Loan application request by user ${req.user.id}`);

      // Calculate monthly repayment amount
      const monthlyInterestRate = interest_rate / 100 / 12;
      const monthlyPayment =
        (loan_amount * monthlyInterestRate) /
        (1 - Math.pow(1 + monthlyInterestRate, -duration));

      // Generate repayment schedule
      const repayments = [];
      for (let i = 1; i <= duration; i++) {
        const dueDate = new Date(repayment_date);
        dueDate.setMonth(dueDate.getMonth() + i);
        repayments.push({
          due_date: dueDate,
          amount: monthlyPayment,
          status: 'pending',
        });
      }

      // Create a new loan
      const loan = new Loan({
        user_id: req.user.id, // Assuming user is authenticated
        loan_amount,
        interest_rate,
        duration,
        repayment_date,
        repayments, // Add the repayment schedule
        status: 'pending', // Set the default status
        created_at: new Date(), // Use created_at to match your Loan model
      });

      // Save the loan to the database
      await loan.save();

      // Log the successful loan application
      logger.info(`Loan application successful for user ${req.user.id}`);

      // Send response
      res.status(201).json(loan);
    } catch (err) {
      // Log the error
      logger.error(`Loan application error: ${err.message}`);
      res.status(500).json({ msg: 'Server error', error: err.message });
    }
  },
];

// Get all loans for a user
exports.getLoansByUser = async (req, res) => {
  try {
    // Log the request
    logger.info(`Fetching loans for user ${req.user.id}`);

    const loans = await Loan.find({ user_id: req.user.id });
    res.json(loans);
  } catch (err) {
    // Log the error
    logger.error(`Error fetching loans for user ${req.user.id}: ${err.message}`);
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
};

// Admin functionality to approve/reject loan
exports.updateLoanStatus = async (req, res) => {
  const { loan_id, status } = req.body;

  try {
    // Log the request
    logger.info(`Updating loan status for loan ${loan_id} to ${status}`);

    const loan = await Loan.findById(loan_id);
    if (!loan) {
      logger.warn(`Loan not found: ${loan_id}`);
      return res.status(404).json({ msg: 'Loan not found' });
    }

    loan.status = status;
    await loan.save();

    // Log the successful update
    logger.info(`Loan status updated successfully for loan ${loan_id}`);

    res.json(loan);
  } catch (err) {
    // Log the error
    logger.error(`Error updating loan status for loan ${loan_id}: ${err.message}`);
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
};