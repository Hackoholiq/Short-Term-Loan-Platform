const Loan = require('../models/Loan');
const User = require('../models/User');
const Transaction = require('../models/Transaction');

/* =====================================================
   ADMIN: LOANS
===================================================== */

// Get all loans (Admin only)
exports.getAllLoans = async (req, res) => {
  try {
    const loans = await Loan.find()
      .populate('user_id', 'email first_name last_name')
      .sort({ createdAt: -1 });

    res.status(200).json(loans);
  } catch (err) {
    console.error('Get all loans error:', err);
    res.status(500).json({ msg: 'Server error' });
  }
};

// Approve or reject a loan (Admin only)
exports.approveLoan = async (req, res) => {
  try {
    const { status } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ msg: 'Invalid loan status' });
    }

    const loan = await Loan.findById(req.params.id);
    if (!loan) {
      return res.status(404).json({ msg: 'Loan not found' });
    }

    loan.status = status;
    await loan.save();

    res.status(200).json({
      msg: `Loan ${status} successfully`,
      loan,
    });
  } catch (err) {
    console.error('Approve loan error:', err);
    res.status(500).json({ msg: 'Server error' });
  }
};

/* =====================================================
   ADMIN: USERS
===================================================== */

// Get all users (Admin only)
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find()
      .select('-password -__v')
      .sort({ createdAt: -1 });

    res.status(200).json(users);
  } catch (err) {
    console.error('Get all users error:', err);
    res.status(500).json({ msg: 'Server error' });
  }
};

// Promote user to admin (Admin only)
exports.promoteToAdmin = async (req, res) => {
  try {
    const { userId } = req.params;

    // Prevent admin from promoting themselves
    if (req.user._id.toString() === userId) {
      return res.status(400).json({
        msg: 'You cannot modify your own role',
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    if (user.user_type === 'admin') {
      return res.status(400).json({ msg: 'User is already an admin' });
    }

    user.user_type = 'admin';
    await user.save();

    res.status(200).json({
      msg: 'User promoted to admin successfully',
      user: {
        id: user._id,
        email: user.email,
        user_type: user.user_type,
      },
    });
  } catch (err) {
    console.error('Promote user error:', err);
    res.status(500).json({ msg: 'Server error' });
  }
};

// Get transactions for a specific user (Admin only)
exports.getUserTransactions = async (req, res) => {
  try {
    const transactions = await Transaction.find({
      user_id: req.params.userId,
    }).sort({ createdAt: -1 });

    res.status(200).json(transactions);
  } catch (err) {
    console.error('Get user transactions error:', err);
    res.status(500).json({ msg: 'Server error' });
  }
};

/* =====================================================
   ADMIN: REPORTS
===================================================== */

// Generate system reports (Admin only)
exports.getReports = async (req, res) => {
  try {
    const totalLoans = await Loan.countDocuments();

    const totalRepaymentsAgg = await Transaction.aggregate([
      { $match: { transaction_type: 'repayment' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    const totalRepayments = totalRepaymentsAgg[0]?.total || 0;

    res.status(200).json({
      totalLoans,
      totalRepayments,
    });
  } catch (err) {
    console.error('Get reports error:', err);
    res.status(500).json({ msg: 'Server error' });
  }
};