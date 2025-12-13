const Loan = require('../models/Loan');
const User = require('../models/User');
const { body, validationResult } = require('express-validator');
const logger = require('../config/logger');
const nodemailer = require('nodemailer');
const cron = require('node-cron');

// Nodemailer setup for repayment reminders
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendReminder = (email, message) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Loan Repayment Reminder',
    text: message,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      logger.error(`Error sending email to ${email}: ${error.message}`);
    } else {
      logger.info(`Email sent to ${email}: ${info.response}`);
    }
  });
};

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
      const errorMessages = errors.array().map((err) => ({
        field: err.param,
        message: err.msg,
      }));
      logger.warn(`Validation errors: ${JSON.stringify(errorMessages)}`);
      return res.status(400).json({ errors: errorMessages });
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

        // Schedule repayment reminder using node-cron
        const reminderDate = new Date(dueDate);
        reminderDate.setDate(reminderDate.getDate() - 1); // Send reminder 1 day before due date
        const cronExpression = `${reminderDate.getMinutes()} ${reminderDate.getHours()} ${reminderDate.getDate()} ${reminderDate.getMonth() + 1} *`;

        cron.schedule(cronExpression, () => {
          sendReminder(req.user.email, `Your repayment of $${monthlyPayment.toFixed(2)} is due tomorrow.`);
        });
      }

      // Create a new loan
      const loan = new Loan({
        user_id: req.user.id,
        loan_amount,
        interest_rate,
        duration,
        repayment_date,
        repayments,
        status: 'pending',
        created_at: new Date(),
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
    const page = parseInt(req.query.page) || 1; // Default to page 1
    const limit = parseInt(req.query.limit) || 10; // Default to 10 loans per page
    const skip = (page - 1) * limit;

    const loans = await Loan.find({ user_id: req.user.id })
      .skip(skip)
      .limit(limit);

    res.json(loans);
  } catch (err) {
    logger.error(`Error fetching loans for user ${req.user.id}: ${err.message}`);
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
};

// Admin functionality to approve/reject loan
exports.updateLoanStatus = async (req, res) => {
  const { loan_id, status } = req.body;

  // Validate status
  const allowedStatuses = ['approved', 'rejected'];
  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ msg: 'Invalid status' });
  }

  try {
    logger.info(`Updating loan status for loan ${loan_id} to ${status}`);

    const loan = await Loan.findById(loan_id);
    if (!loan) {
      logger.warn(`Loan not found: ${loan_id}`);
      return res.status(404).json({ msg: 'Loan not found' });
    }

    loan.status = status;
    await loan.save();

    logger.info(`Loan status updated successfully for loan ${loan_id}`);
    res.json(loan);
  } catch (err) {
    logger.error(`Error updating loan status for loan ${loan_id}: ${err.message}`);
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
};

// Check if a user is pre-approved for a loan
exports.checkPreApproval = async (req, res) => {
  try {
    console.log('🔍 Checking pre-approval for user ID:', req.user.id);
    
    const user = await User.findById(req.user.id);
    
    if (!user) {
      logger.warn(`User not found for pre-approval check: ${req.user.id}`);
      return res.status(404).json({ 
        isPreApproved: false, 
        message: 'User not found' 
      });
    }
    
    console.log('📊 User credit score:', user.creditScore);
    
    const MIN_CREDIT_SCORE = 600; // Example threshold
    
    // Handle case where creditScore might be undefined or null
    const userCreditScore = user.creditScore || 0;
    const isPreApproved = userCreditScore >= MIN_CREDIT_SCORE;
    
    logger.info(`Pre-approval check for user ${req.user.id}: ${isPreApproved ? 'Approved' : 'Rejected'}`);
    
    res.json({ 
      isPreApproved,
      creditScore: userCreditScore,
      minRequiredScore: MIN_CREDIT_SCORE,
      userDetails: {
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email
      },
      message: isPreApproved 
        ? `Congratulations! You are pre-approved for a loan with a credit score of ${userCreditScore}.`
        : `Your credit score of ${userCreditScore} does not meet the minimum requirement of ${MIN_CREDIT_SCORE}.`
    });
  } catch (err) {
    logger.error(`Error checking pre-approval: ${err.message}`);
    console.error('❌ Pre-approval error details:', err);
    res.status(500).json({ 
      msg: 'Server error during pre-approval check', 
      error: err.message 
    });
  }
};