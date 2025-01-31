const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
  loan_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Loan', required: true }, // Reference to Loan
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Reference to User
  amount: { type: Number, required: true },
  transaction_date: { type: Date, default: Date.now },
  status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
  transaction_type: { type: String, enum: ['repayment', 'disbursement'], required: true },
  created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Transaction', TransactionSchema);
