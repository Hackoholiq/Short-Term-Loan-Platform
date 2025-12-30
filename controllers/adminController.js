const Loan = require('../models/Loan');
const User = require('../models/User');
const Transaction = require('../models/Transaction');

/* =====================================================
   ADMIN: LOANS
===================================================== */

// GET /api/admin/loans
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

// PUT /api/admin/loans/:id/approve   body: { status: "approved" | "rejected" }
exports.approveLoan = async (req, res) => {
  try {
    const { status } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ msg: 'Invalid loan status' });
    }

    const loan = await Loan.findById(req.params.id);
    if (!loan) return res.status(404).json({ msg: 'Loan not found' });

    loan.status = status;
    await loan.save();

    res.status(200).json({ msg: `Loan ${status} successfully`, loan });
  } catch (err) {
    console.error('Approve loan error:', err);
    res.status(500).json({ msg: 'Server error' });
  }
};

/* =====================================================
   ADMIN: USERS
===================================================== */

// GET /api/admin/users
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

// PUT /api/admin/users/:userId/promote
exports.promoteToAdmin = async (req, res) => {
  try {
    const { userId } = req.params;

    if (req.user?._id?.toString() === userId) {
      return res.status(400).json({ msg: 'You cannot modify your own role' });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ msg: 'User not found' });

    if (user.user_type === 'admin') {
      return res.status(400).json({ msg: 'User is already an admin' });
    }

    user.user_type = 'admin';
    await user.save();

    res.status(200).json({
      msg: 'User promoted to admin successfully',
      user: { id: user._id, email: user.email, user_type: user.user_type },
    });
  } catch (err) {
    console.error('Promote user error:', err);
    res.status(500).json({ msg: 'Server error' });
  }
};

/**
 * POST /api/admin/promote
 * body can be:
 *   { email: "user@example.com" }
 *   OR { userId: "..." }
 */
exports.promoteUser = async (req, res) => {
  try {
    const { email, userId } = req.body || {};

    if (!email && !userId) {
      return res.status(400).json({ msg: 'Provide email or userId' });
    }

    const user = email
      ? await User.findOne({ email: email.toLowerCase().trim() })
      : await User.findById(userId);

    if (!user) return res.status(404).json({ msg: 'User not found' });

    // Prevent admin from promoting themselves
    if (req.user?._id?.toString() === user._id.toString()) {
      return res.status(400).json({ msg: 'You cannot modify your own role' });
    }

    if (user.user_type === 'admin') {
      return res.status(400).json({ msg: 'User is already an admin' });
    }

    user.user_type = 'admin';
    await user.save();

    res.status(200).json({
      msg: `${user.email} has been promoted to admin successfully!`,
      user: { id: user._id, email: user.email, user_type: user.user_type },
    });
  } catch (err) {
    console.error('promoteUser error:', err);
    res.status(500).json({ msg: 'Server error' });
  }
};

// GET /api/admin/users/:userId/transactions
exports.getUserTransactions = async (req, res) => {
  try {
    const transactions = await Transaction.find({ user_id: req.params.userId })
      .sort({ createdAt: -1 });

    res.status(200).json(transactions);
  } catch (err) {
    console.error('Get user transactions error:', err);
    res.status(500).json({ msg: 'Server error' });
  }
};

/* =====================================================
   ADMIN: REPORTS
===================================================== */

// GET /api/admin/reports
exports.getReports = async (req, res) => {
  try {
    const totalLoans = await Loan.countDocuments();

    const totalRepaymentsAgg = await Transaction.aggregate([
      { $match: { transaction_type: 'repayment' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    const totalRepayments = totalRepaymentsAgg[0]?.total || 0;

    res.status(200).json({ totalLoans, totalRepayments });
  } catch (err) {
    console.error('Get reports error:', err);
    res.status(500).json({ msg: 'Server error' });
  }
};