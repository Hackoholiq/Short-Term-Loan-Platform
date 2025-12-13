const Loan = require('../models/Loan');
const User = require('../models/User');
const Transaction = require('../models/Transaction');

// Get all loans
exports.getAllLoans = async (req, res) => {
  try {
    const loans = await Loan.find();
    res.json(loans);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};

// Approve or reject a loan
exports.approveLoan = async (req, res) => {
  try {
    const { status } = req.body;
    const loan = await Loan.findById(req.params.id);
    if (!loan) {
      return res.status(404).json({ msg: 'Loan not found' });
    }

    loan.status = status;
    await loan.save();

    res.json(loan);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};

// Get all users
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find();
    res.json(users);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};

// Promote user to Admin
exports.promoteToAdmin = async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    user.user_type = 'admin';
    await user.save();

    res.json(user);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};

// Get all transactions for a user
exports.getUserTransactions = async (req, res) => {
  try {
    const transactions = await Transaction.find({ user_id: req.params.userId });
    res.json(transactions);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};

// Generate reports (total loans, repayments, etc.)
exports.getReports = async (req, res) => {
  try {
    const totalLoans = await Loan.countDocuments();
    const totalRepayments = await Transaction.aggregate([
      { $match: { transaction_type: 'repayment' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    res.json({ totalLoans, totalRepayments: totalRepayments[0]?.total || 0 });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};