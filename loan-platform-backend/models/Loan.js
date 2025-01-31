const mongoose = require('mongoose');

const LoanSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Reference to the borrower
  loan_amount: { type: Number, required: true },
  interest_rate: { type: Number, required: true },
  duration: { type: Number, required: true }, // Duration in months or weeks
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'repaid'], default: 'pending' },
  repayment_date: { type: Date, required: true },
  created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Loan', LoanSchema);
