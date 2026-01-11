// controllers/loanController.js

const Loan = require('../models/Loan');
const User = require('../models/User');
const Transaction = require('../models/Transaction');

const { body, validationResult } = require('express-validator');
const logger = require('../config/logger');

const nodemailer = require('nodemailer');
const cron = require('node-cron');

// ✅ KYC rules (Option A)
const { getKycRequirementForAmount, meetsKyc } = require('../utils/kycRules');

/* =========================
   NODEMAILER SETUP
========================= */
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

const sendReminder = (email, message) => {
  if (!email) return;

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Loan Repayment Reminder',
    text: message,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) logger.error(`Error sending email to ${email}: ${error.message}`);
    else logger.info(`Email sent to ${email}: ${info.response}`);
  });
};

/* =========================
   APPLY FOR LOAN
   POST /api/loan/apply
========================= */
exports.applyForLoan = [
  body('loan_amount').isNumeric().withMessage('Loan amount must be a number'),
  body('interest_rate').isNumeric().withMessage('Interest rate must be a number'),
  body('duration').isNumeric().withMessage('Duration must be a number'),
  body('repayment_date').isISO8601().withMessage('Repayment date must be a valid date'),

  async (req, res) => {
    // ✅ express-validator results
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessages = errors.array().map((err) => ({
        field: err.param,
        message: err.msg,
      }));
      logger.warn(`Validation errors: ${JSON.stringify(errorMessages)}`);
      return res.status(400).json({ errors: errorMessages });
    }

    // Normalize numeric inputs
    const loan_amount = Number(req.body.loan_amount);
    const interest_rate = Number(req.body.interest_rate);
    const duration = Number(req.body.duration);
    const repayment_date = req.body.repayment_date;

    try {
      logger.info(`Loan application request by user ${req.user.id}`);

      /* =========================
         ✅ KYC ENFORCEMENT (Option A)
      ========================= */
      const requirement = getKycRequirementForAmount(loan_amount);

      const user = await User.findById(req.user.id).select('kyc email first_name last_name creditScore');
      if (!user) return res.status(404).json({ msg: 'User not found' });

      const userKycStatus = user?.kyc?.status || 'not_started';
      const userKycLevel = String(user?.kyc?.level || 'none').toLowerCase();

      if (requirement.required) {
        if (userKycStatus !== 'verified') {
          return res.status(403).json({
            code: 'KYC_VERIFICATION_REQUIRED',
            msg: `KYC must be verified (${requirement.level}) before applying for this amount.`,
            requiredLevel: requirement.level,
            currentStatus: userKycStatus,
            currentLevel: userKycLevel,
            redirectTo: '/kyc/verify',
          });
        }

        if (!meetsKyc(requirement.level, userKycLevel)) {
          return res.status(403).json({
            code: 'KYC_LEVEL_INSUFFICIENT',
            msg: `Your KYC level must be ${requirement.level} for this amount.`,
            requiredLevel: requirement.level,
            currentStatus: userKycStatus,
            currentLevel: userKycLevel,
            redirectTo: '/kyc/verify',
          });
        }
      }

      /* =========================
         LOAN CALCULATION
      ========================= */
      if (!duration || duration <= 0) {
        return res.status(400).json({ msg: 'Duration must be greater than 0' });
      }
      if (!loan_amount || loan_amount <= 0) {
        return res.status(400).json({ msg: 'Loan amount must be greater than 0' });
      }

      const monthlyInterestRate = interest_rate / 100 / 12;

      const monthlyPayment =
        monthlyInterestRate === 0
          ? loan_amount / duration
          : (loan_amount * monthlyInterestRate) / (1 - Math.pow(1 + monthlyInterestRate, -duration));

      /* =========================
         REPAYMENT SCHEDULE + REMINDERS
         ⚠️ Note: cron schedules are in-memory; they will reset on server restart.
      ========================= */
      const repayments = [];
      for (let i = 1; i <= duration; i++) {
        const dueDate = new Date(repayment_date);
        dueDate.setMonth(dueDate.getMonth() + i);

        repayments.push({
          due_date: dueDate,
          amount: monthlyPayment,
          status: 'pending',
        });

        // Reminder 1 day before due date
        const reminderDate = new Date(dueDate);
        reminderDate.setDate(reminderDate.getDate() - 1);

        const cronExpression = `${reminderDate.getMinutes()} ${reminderDate.getHours()} ${reminderDate.getDate()} ${
          reminderDate.getMonth() + 1
        } *`;

        cron.schedule(cronExpression, () => {
          sendReminder(
            user.email,
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
   GET /api/loan/my-loans?page=&limit=
========================= */
exports.getLoansByUser = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
    const skip = (page - 1) * limit;

    const loans = await Loan.find({ user_id: req.user.id }).skip(skip).limit(limit);
    return res.json(loans);
  } catch (err) {
    logger.error(`Error fetching loans for user ${req.user.id}: ${err.message}`);
    return res.status(500).json({ msg: 'Server error', error: err.message });
  }
};

/* =========================
   ADMIN: UPDATE LOAN STATUS
   (Your routes may call this differently; support both body + params)
========================= */
exports.updateLoanStatus = async (req, res) => {
  // Support multiple shapes:
  // - req.body.loan_id (older)
  // - req.body.loanId
  // - req.params.loanId (REST)
  const loanId = req.body.loan_id || req.body.loanId || req.params.loanId;
  const status = req.body.status;

  const allowedStatuses = ['approved', 'rejected'];
  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ msg: 'Invalid status' });
  }

  try {
    logger.info(`Updating loan status for loan ${loanId} to ${status}`);

    const loan = await Loan.findById(loanId);
    if (!loan) {
      logger.warn(`Loan not found: ${loanId}`);
      return res.status(404).json({ msg: 'Loan not found' });
    }

    loan.status = status;
    await loan.save();

    logger.info(`Loan status updated successfully for loan ${loanId}`);
    return res.json(loan);
  } catch (err) {
    logger.error(`Error updating loan status for loan ${loanId}: ${err.message}`);
    return res.status(500).json({ msg: 'Server error', error: err.message });
  }
};

/* =========================
   PRE-APPROVAL
   GET /api/loan/pre-approval
========================= */
exports.checkPreApproval = async (req, res) => {
  try {
    logger.info(`🔍 Checking pre-approval for user ID: ${req.user.id}`);

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

    // These fields might not exist in your schema; set defensively.
    loan.total_paid = Number(loan.total_paid || 0) + applied;

    if (loan.remaining_balance != null) {
      loan.remaining_balance = Math.max(Number(loan.remaining_balance || 0) - applied, 0);
    }

    loan.last_payment_date = new Date();
    loan.payments_made = loan.repayments.filter((x) => String(x.status).toLowerCase() === 'paid').length;

    const nextUnpaid = loan.repayments.find((x) => String(x.status).toLowerCase() !== 'paid');
    loan.next_payment_date = nextUnpaid?.due_date || null;

    const allPaid = loan.repayments.every((x) => String(x.status).toLowerCase() === 'paid');
    const remainingBalance = loan.remaining_balance == null ? null : Number(loan.remaining_balance || 0);

    if (allPaid || (remainingBalance != null && remainingBalance <= 0)) {
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