const Loan = require('../models/Loan');
const User = require('../models/User');
const { body, validationResult } = require('express-validator');
const logger = require('../config/logger');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const Transaction = require('../models/Transaction');

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

/* =========================
   APPLY FOR LOAN
========================= */
exports.applyForLoan = [
  body('loan_amount').isNumeric().withMessage('Loan amount must be a number'),
  body('interest_rate').isNumeric().withMessage('Interest rate must be a number'),
  body('duration').isNumeric().withMessage('Duration must be a number'),
  body('repayment_date').isISO8601().withMessage('Repayment date must be a valid date'),

  async (req, res) => {
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
      logger.info(`Loan application request by user ${req.user.id}`);

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

        // Schedule reminder 1 day before due date
        const reminderDate = new Date(dueDate);
        reminderDate.setDate(reminderDate.getDate() - 1);
        const cronExpression = `${reminderDate.getMinutes()} ${reminderDate.getHours()} ${reminderDate.getDate()} ${reminderDate.getMonth() + 1} *`;

        cron.schedule(cronExpression, () => {
          sendReminder(
            req.user.email,
            `Your repayment of $${monthlyPayment.toFixed(2)} is due tomorrow.`
          );
        });
      }

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

      await loan.save();

      logger.info(`Loan application successful for user ${req.user.id}`);
      return res.status(201).json(loan);
    } catch (err) {
      logger.error(`Loan application error: ${err.message}`);
      return res.status(500).json({ msg: 'Server error', error: err.message });
    }
  },
];

/* =========================
   GET MY LOANS
========================= */
exports.getLoansByUser = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const loans = await Loan.find({ user_id: req.user.id })
      .skip(skip)
      .limit(limit);

    return res.json(loans);
  } catch (err) {
    logger.error(`Error fetching loans for user ${req.user.id}: ${err.message}`);
    return res.status(500).json({ msg: 'Server error', error: err.message });
  }
};

/* =========================
   ADMIN: UPDATE LOAN STATUS
========================= */
exports.updateLoanStatus = async (req, res) => {
  const { loan_id, status } = req.body;

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
    return res.json(loan);
  } catch (err) {
    logger.error(`Error updating loan status for loan ${loan_id}: ${err.message}`);
    return res.status(500).json({ msg: 'Server error', error: err.message });
  }
};

/* =========================
   PRE-APPROVAL
========================= */
exports.checkPreApproval = async (req, res) => {
  try {
    console.log('🔍 Checking pre-approval for user ID:', req.user.id);

    const user = await User.findById(req.user.id);
    if (!user) {
      logger.warn(`User not found for pre-approval check: ${req.user.id}`);
      return res.status(404).json({
        isPreApproved: false,
        message: 'User not found',
      });
    }

    const MIN_CREDIT_SCORE = 600;
    const userCreditScore = user.creditScore || 0;
    const isPreApproved = userCreditScore >= MIN_CREDIT_SCORE;

    logger.info(
      `Pre-approval check for user ${req.user.id}: ${isPreApproved ? 'Approved' : 'Rejected'}`
    );

    return res.json({
      isPreApproved,
      creditScore: userCreditScore,
      minRequiredScore: MIN_CREDIT_SCORE,
      userDetails: {
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
      },
      message: isPreApproved
        ? `Congratulations! You are pre-approved for a loan with a credit score of ${userCreditScore}.`
        : `Your credit score of ${userCreditScore} does not meet the minimum requirement of ${MIN_CREDIT_SCORE}.`,
    });
  } catch (err) {
    logger.error(`Error checking pre-approval: ${err.message}`);
    console.error('❌ Pre-approval error details:', err);
    return res.status(500).json({
      msg: 'Server error during pre-approval check',
      error: err.message,
    });
  }
};

/* =========================
   MAKE PAYMENT
   POST /api/loan/:loanId/pay
   body: { amount: number }
========================= */
exports.makePayment = async (req, res) => {
  try {
    const { loanId } = req.params;
    const amount = Number(req.body?.amount);

    if (!amount || Number.isNaN(amount) || amount <= 0) {
      return res.status(400).json({ msg: 'amount must be a number greater than 0' });
    }

    // Ensure loan belongs to user
    const loan = await Loan.findOne({ _id: loanId, user_id: req.user.id });
    if (!loan) return res.status(404).json({ msg: 'Loan not found' });

    const status = String(loan.status || '').toLowerCase();
    if (['rejected', 'cancelled', 'draft'].includes(status)) {
      return res.status(400).json({ msg: `Cannot make payment while loan is '${loan.status}'` });
    }
    if (status === 'repaid') {
      return res.status(400).json({ msg: 'Loan is already fully repaid' });
    }

    if (!Array.isArray(loan.repayments) || loan.repayments.length === 0) {
      return res.status(400).json({ msg: 'This loan has no repayment schedule' });
    }

    // Apply payment to earliest unpaid repayments
    let remaining = amount;
    let applied = 0;

    for (const r of loan.repayments) {
      if (remaining <= 0) break;

      const rStatus = String(r.status || '').toLowerCase();
      if (rStatus === 'paid') continue;

      const dueAmount = Number(r.amount || 0);
      const alreadyPaid = Number(r.paid_amount || 0);

      const remainingForThisInstallment = Math.max(dueAmount - alreadyPaid, 0);
      if (remainingForThisInstallment <= 0) {
        r.status = 'paid';
        r.paid_date = r.paid_date || new Date();
        continue;
      }

      const payNow = Math.min(remaining, remainingForThisInstallment);

      r.paid_amount = alreadyPaid + payNow;
      r.paid_date = new Date();

      r.status = r.paid_amount >= dueAmount ? 'paid' : 'partially_paid';

      remaining -= payNow;
      applied += payNow;
    }

    if (applied <= 0) {
      return res.status(400).json({ msg: 'No repayment items available to pay' });
    }

    loan.total_paid = Number(loan.total_paid || 0) + applied;
    loan.remaining_balance = Math.max(Number(loan.remaining_balance || 0) - applied, 0);
    loan.last_payment_date = new Date();

    loan.payments_made = loan.repayments.filter((x) => String(x.status).toLowerCase() === 'paid').length;

    const nextUnpaid = loan.repayments.find((x) => String(x.status).toLowerCase() !== 'paid');
    loan.next_payment_date = nextUnpaid?.due_date || null;

    const allPaid = loan.repayments.every((x) => String(x.status).toLowerCase() === 'paid');
    if (allPaid || loan.remaining_balance <= 0) {
      loan.status = 'repaid';
    } else if (['approved', 'disbursed', 'pending', 'under_review', 'kyc_pending'].includes(status)) {
      loan.status = 'active';
    }

    await loan.save();

    const tx = await Transaction.create({
      loan_id: loan._id,
      user_id: req.user.id,
      amount: applied,
      transaction_type: 'repayment',
      status: 'completed',
      transaction_date: new Date(),
      created_at: new Date(),
    });

    return res.status(200).json({
      msg: 'Payment recorded successfully',
      appliedAmount: applied,
      unappliedAmount: Math.max(amount - applied, 0),
      loan,
      transaction: tx,
    });
  } catch (err) {
    logger.error(`makePayment error: ${err.message}`);
    return res.status(500).json({ msg: 'Server error', error: err.message });
  }
};