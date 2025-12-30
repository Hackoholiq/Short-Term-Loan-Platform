const mongoose = require('mongoose');
const Loan = require('../models/Loan');
const User = require('../models/User');
const Transaction = require('../models/Transaction');

/* =====================================================
   HELPERS
===================================================== */

const getRequesterId = (req) => {
  // Works with either:
  // req.user = { id, user_type }
  // or req.user = { _id, user_type }
  // or req.user = { user: { id } }
  return (
    req.user?.id ||
    req.user?._id ||
    req.user?.user?.id ||
    req.user?.user?._id ||
    null
  );
};

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

/* =====================================================
   ADMIN: LOANS
===================================================== */

// GET /api/admin/loans?status=pending|approved|rejected
exports.getAllLoans = async (req, res) => {
  try {
    const { status } = req.query;

    const filter = {};
    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      filter.status = status;
    }

    const loans = await Loan.find(filter)
      .populate('user_id', 'email first_name last_name')
      .sort({ createdAt: -1 });

    return res.status(200).json(loans);
  } catch (err) {
    console.error('Get all loans error:', err);
    return res.status(500).json({ msg: 'Server error' });
  }
};

// PUT /api/admin/loans/:id/approve   body: { status: "approved" | "rejected" }
exports.approveLoan = async (req, res) => {
  try {
    const { status } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ msg: 'Invalid loan status' });
    }

    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ msg: 'Invalid loan id' });
    }

    const loan = await Loan.findById(id);
    if (!loan) return res.status(404).json({ msg: 'Loan not found' });

    // Optional: only allow update if pending
    // (comment out if your app uses other statuses)
    if (loan.status && loan.status !== 'pending') {
      return res.status(400).json({ msg: `Loan is already ${loan.status}` });
    }

    loan.status = status;
    await loan.save();

    return res.status(200).json({
      msg: `Loan ${status} successfully`,
      loan,
    });
  } catch (err) {
    console.error('Approve loan error:', err);
    return res.status(500).json({ msg: 'Server error' });
  }
};

/* =====================================================
   ADMIN: USERS
===================================================== */

// GET /api/admin/users
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find()
      // Keep only fields useful for the admin list view:
      .select([
        'first_name',
        'last_name',
        'email',
        'phone',
        'user_type',
        'account_status',
        'created_at',
        'updated_at',
        'risk_level',
        'risk_score',
        'kyc.status',
        'kyc.level',
        'kyc.verification_attempts',
        'kyc.verified_at',
        'next_kyc_review_due',
      ].join(' '))
      .sort({ created_at: -1 })
      .lean(); // lean = faster + plain objects

    return res.status(200).json(users);
  } catch (err) {
    console.error('Get all users error:', err);
    return res.status(500).json({ msg: 'Server error' });
  }
};

// PUT /api/admin/users/:userId/promote
exports.promoteToAdmin = async (req, res) => {
  try {
    const requesterId = getRequesterId(req);
    const { userId } = req.params;

    if (!isValidObjectId(userId)) {
      return res.status(400).json({ msg: 'Invalid user id' });
    }

    // Prevent admin from promoting themselves
    if (requesterId && requesterId.toString() === userId.toString()) {
      return res.status(400).json({ msg: 'You cannot modify your own role' });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ msg: 'User not found' });

    if (user.user_type === 'admin') {
      return res.status(400).json({ msg: 'User is already an admin' });
    }

    user.user_type = 'admin';
    await user.save();

    return res.status(200).json({
      msg: 'User promoted to admin successfully',
      user: { id: user._id, email: user.email, user_type: user.user_type },
    });
  } catch (err) {
    console.error('Promote user error:', err);
    return res.status(500).json({ msg: 'Server error' });
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
    const requesterId = getRequesterId(req);
    const { email, userId } = req.body || {};

    if (!email && !userId) {
      return res.status(400).json({ msg: 'Provide email or userId' });
    }

    let user = null;

    if (email) {
      const normalizedEmail = String(email).toLowerCase().trim();
      user = await User.findOne({ email: normalizedEmail });
    } else {
      if (!isValidObjectId(userId)) {
        return res.status(400).json({ msg: 'Invalid user id' });
      }
      user = await User.findById(userId);
    }

    if (!user) return res.status(404).json({ msg: 'User not found' });

    // Prevent admin from promoting themselves
    if (requesterId && requesterId.toString() === user._id.toString()) {
      return res.status(400).json({ msg: 'You cannot modify your own role' });
    }

    if (user.user_type === 'admin') {
      return res.status(400).json({ msg: 'User is already an admin' });
    }

    user.user_type = 'admin';
    await user.save();

    return res.status(200).json({
      msg: `${user.email} has been promoted to admin successfully!`,
      user: { id: user._id, email: user.email, user_type: user.user_type },
    });
  } catch (err) {
    console.error('promoteUser error:', err);
    return res.status(500).json({ msg: 'Server error' });
  }
};

// GET /api/admin/users/:userId/transactions
exports.getUserTransactions = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!isValidObjectId(userId)) {
      return res.status(400).json({ msg: 'Invalid user id' });
    }

    const transactions = await Transaction.find({ user_id: userId }).sort({
      createdAt: -1,
    });

    return res.status(200).json(transactions);
  } catch (err) {
    console.error('Get user transactions error:', err);
    return res.status(500).json({ msg: 'Server error' });
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

    return res.status(200).json({ totalLoans, totalRepayments });
  } catch (err) {
    console.error('Get reports error:', err);
    return res.status(500).json({ msg: 'Server error' });
  }
};