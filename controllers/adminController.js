const mongoose = require('mongoose');
const Loan = require('../models/Loan');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const AuditLog = require('../models/AuditLog');
const { audit } = require('../utils/audit');

/* =====================================================
   HELPERS
===================================================== */

const getRequesterId = (req) => {
  // Supports:
  // req.user = { id, user_type, email }
  // req.user = { _id, user_type, email }
  // req.user = { user: { id } }
  return (
    req.user?.id ||
    req.user?._id ||
    req.user?.user?.id ||
    req.user?.user?._id ||
    null
  );
};

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const safeShortId = (id) => {
  try {
    return String(id || '').slice(0, 8);
  } catch {
    return '';
  }
};

/* =====================================================
   ADMIN: LOANS
===================================================== */

// GET /api/admin/loans?status=pending|approved|rejected
exports.getAllLoans = async (req, res) => {
  const { status } = req.query;

  try {
    const filter = {};
    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      filter.status = status;
    }

    const loans = await Loan.find(filter)
      .populate('user_id', 'email first_name last_name')
      .sort({ createdAt: -1 })
      .lean();

    await audit(req, {
      action: 'ADMIN_VIEW_LOANS',
      target_type: 'loan',
      status: 'success',
      metadata: {
        statusFilter: status || null,
        count: loans.length,
      },
    });

    return res.status(200).json(loans);
  } catch (err) {
    console.error('Get all loans error:', err);

    await audit(req, {
      action: 'ADMIN_VIEW_LOANS',
      target_type: 'loan',
      status: 'fail',
      reason: err.message,
      metadata: { statusFilter: status || null },
    });

    return res.status(500).json({ msg: 'Server error' });
  }
};

// PUT /api/admin/loans/:id/approve   body: { status: "approved" | "rejected" }
exports.approveLoan = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body || {};

  try {
    if (!['approved', 'rejected'].includes(status)) {
      await audit(req, {
        action: 'ADMIN_UPDATE_LOAN_STATUS',
        target_type: 'loan',
        target_id: isValidObjectId(id) ? id : undefined,
        target_label: safeShortId(id),
        status: 'fail',
        reason: 'Invalid loan status',
        metadata: { attempted_status: status },
      });
      return res.status(400).json({ msg: 'Invalid loan status' });
    }

    if (!isValidObjectId(id)) {
      await audit(req, {
        action: 'ADMIN_UPDATE_LOAN_STATUS',
        target_type: 'loan',
        status: 'fail',
        reason: 'Invalid loan id',
        metadata: { loanId: id, attempted_status: status },
      });
      return res.status(400).json({ msg: 'Invalid loan id' });
    }

    const loan = await Loan.findById(id);
    if (!loan) {
      await audit(req, {
        action: 'ADMIN_UPDATE_LOAN_STATUS',
        target_type: 'loan',
        target_id: id,
        target_label: safeShortId(id),
        status: 'fail',
        reason: 'Loan not found',
        metadata: { attempted_status: status },
      });
      return res.status(404).json({ msg: 'Loan not found' });
    }

    // Optional: only allow update if pending
    if (loan.status && loan.status !== 'pending') {
      await audit(req, {
        action: 'ADMIN_UPDATE_LOAN_STATUS',
        target_type: 'loan',
        target_id: loan._id,
        target_label: safeShortId(loan._id),
        status: 'fail',
        reason: `Loan already ${loan.status}`,
        metadata: { current_status: loan.status, attempted_status: status },
      });
      return res.status(400).json({ msg: `Loan is already ${loan.status}` });
    }

    const prevStatus = loan.status || 'pending';
    loan.status = status;
    await loan.save();

    await audit(req, {
      action: 'ADMIN_UPDATE_LOAN_STATUS',
      target_type: 'loan',
      target_id: loan._id,
      target_label: safeShortId(loan._id),
      status: 'success',
      metadata: {
        previous_status: prevStatus,
        new_status: status,
        loan_amount: loan.loan_amount,
        user_id: loan.user_id,
      },
    });

    return res.status(200).json({
      msg: `Loan ${status} successfully`,
      loan,
    });
  } catch (err) {
    console.error('Approve loan error:', err);

    await audit(req, {
      action: 'ADMIN_UPDATE_LOAN_STATUS',
      target_type: 'loan',
      target_id: isValidObjectId(id) ? id : undefined,
      target_label: safeShortId(id),
      status: 'fail',
      reason: err.message,
      metadata: { attempted_status: status },
    });

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
      .select(
        [
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
        ].join(' ')
      )
      .sort({ created_at: -1 })
      .lean();

    await audit(req, {
      action: 'ADMIN_VIEW_USERS',
      target_type: 'user',
      status: 'success',
      metadata: { count: users.length },
    });

    return res.status(200).json(users);
  } catch (err) {
    console.error('Get all users error:', err);

    await audit(req, {
      action: 'ADMIN_VIEW_USERS',
      target_type: 'user',
      status: 'fail',
      reason: err.message,
    });

    return res.status(500).json({ msg: 'Server error' });
  }
};

// PUT /api/admin/users/:userId/promote
exports.promoteToAdmin = async (req, res) => {
  const requesterId = getRequesterId(req);
  const { userId } = req.params;

  try {
    if (!isValidObjectId(userId)) {
      await audit(req, {
        action: 'ADMIN_PROMOTE_USER',
        target_type: 'user',
        status: 'fail',
        reason: 'Invalid user id',
        metadata: { userId },
      });
      return res.status(400).json({ msg: 'Invalid user id' });
    }

    // Prevent self role-change
    if (requesterId && requesterId.toString() === userId.toString()) {
      await audit(req, {
        action: 'ADMIN_PROMOTE_USER',
        target_type: 'user',
        target_id: userId,
        status: 'fail',
        reason: 'Attempted to modify own role',
      });
      return res.status(400).json({ msg: 'You cannot modify your own role' });
    }

    const user = await User.findById(userId);
    if (!user) {
      await audit(req, {
        action: 'ADMIN_PROMOTE_USER',
        target_type: 'user',
        target_id: userId,
        status: 'fail',
        reason: 'User not found',
      });
      return res.status(404).json({ msg: 'User not found' });
    }

    if (user.user_type === 'admin') {
      await audit(req, {
        action: 'ADMIN_PROMOTE_USER',
        target_type: 'user',
        target_id: user._id,
        target_label: user.email,
        status: 'fail',
        reason: 'User already admin',
      });
      return res.status(400).json({ msg: 'User is already an admin' });
    }

    user.user_type = 'admin';
    await user.save();

    await audit(req, {
      action: 'ADMIN_PROMOTE_USER',
      target_type: 'user',
      target_id: user._id,
      target_label: user.email,
      status: 'success',
      metadata: { via: 'userId' },
    });

    return res.status(200).json({
      msg: 'User promoted to admin successfully',
      user: { id: user._id, email: user.email, user_type: user.user_type },
    });
  } catch (err) {
    console.error('Promote user error:', err);

    await audit(req, {
      action: 'ADMIN_PROMOTE_USER',
      target_type: 'user',
      target_id: isValidObjectId(userId) ? userId : undefined,
      status: 'fail',
      reason: err.message,
      metadata: { via: 'userId' },
    });

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
  const requesterId = getRequesterId(req);
  const { email, userId } = req.body || {};

  try {
    if (!email && !userId) {
      await audit(req, {
        action: 'ADMIN_PROMOTE_USER',
        target_type: 'user',
        status: 'fail',
        reason: 'No email or userId provided',
      });
      return res.status(400).json({ msg: 'Provide email or userId' });
    }

    let user = null;

    if (email) {
      const normalizedEmail = String(email).toLowerCase().trim();
      user = await User.findOne({ email: normalizedEmail });
    } else {
      if (!isValidObjectId(userId)) {
        await audit(req, {
          action: 'ADMIN_PROMOTE_USER',
          target_type: 'user',
          status: 'fail',
          reason: 'Invalid user id',
          metadata: { userId },
        });
        return res.status(400).json({ msg: 'Invalid user id' });
      }
      user = await User.findById(userId);
    }

    if (!user) {
      await audit(req, {
        action: 'ADMIN_PROMOTE_USER',
        target_type: 'user',
        status: 'fail',
        reason: 'User not found',
        metadata: {
          via: email ? 'email' : 'userId',
          email: email ? String(email).toLowerCase().trim() : undefined,
          userId: userId || undefined,
        },
      });
      return res.status(404).json({ msg: 'User not found' });
    }

    // Prevent self role-change
    if (requesterId && requesterId.toString() === user._id.toString()) {
      await audit(req, {
        action: 'ADMIN_PROMOTE_USER',
        target_type: 'user',
        target_id: user._id,
        target_label: user.email,
        status: 'fail',
        reason: 'Attempted to modify own role',
      });
      return res.status(400).json({ msg: 'You cannot modify your own role' });
    }

    if (user.user_type === 'admin') {
      await audit(req, {
        action: 'ADMIN_PROMOTE_USER',
        target_type: 'user',
        target_id: user._id,
        target_label: user.email,
        status: 'fail',
        reason: 'User already admin',
      });
      return res.status(400).json({ msg: 'User is already an admin' });
    }

    user.user_type = 'admin';
    await user.save();

    await audit(req, {
      action: 'ADMIN_PROMOTE_USER',
      target_type: 'user',
      target_id: user._id,
      target_label: user.email,
      status: 'success',
      metadata: { via: email ? 'email' : 'userId' },
    });

    return res.status(200).json({
      msg: `${user.email} has been promoted to admin successfully!`,
      user: { id: user._id, email: user.email, user_type: user.user_type },
    });
  } catch (err) {
    console.error('promoteUser error:', err);

    await audit(req, {
      action: 'ADMIN_PROMOTE_USER',
      target_type: 'user',
      status: 'fail',
      reason: err.message,
      metadata: {
        via: email ? 'email' : userId ? 'userId' : 'unknown',
        email: email ? String(email).toLowerCase().trim() : undefined,
        userId: userId || undefined,
      },
    });

    return res.status(500).json({ msg: 'Server error' });
  }
};

// GET /api/admin/users/:userId/transactions
exports.getUserTransactions = async (req, res) => {
  const { userId } = req.params;

  try {
    if (!isValidObjectId(userId)) {
      await audit(req, {
        action: 'ADMIN_VIEW_USER_TRANSACTIONS',
        target_type: 'user',
        status: 'fail',
        reason: 'Invalid user id',
        metadata: { userId },
      });
      return res.status(400).json({ msg: 'Invalid user id' });
    }

    const transactions = await Transaction.find({ user_id: userId })
      .sort({ createdAt: -1 })
      .lean();

    await audit(req, {
      action: 'ADMIN_VIEW_USER_TRANSACTIONS',
      target_type: 'user',
      target_id: userId,
      status: 'success',
      metadata: { count: transactions.length },
    });

    return res.status(200).json(transactions);
  } catch (err) {
    console.error('Get user transactions error:', err);

    await audit(req, {
      action: 'ADMIN_VIEW_USER_TRANSACTIONS',
      target_type: 'user',
      target_id: isValidObjectId(userId) ? userId : undefined,
      status: 'fail',
      reason: err.message,
    });

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

    await audit(req, {
      action: 'ADMIN_VIEW_REPORTS',
      target_type: 'report',
      status: 'success',
      metadata: { totalLoans },
    });

    return res.status(200).json({ totalLoans, totalRepayments });
  } catch (err) {
    console.error('Get reports error:', err);

    await audit(req, {
      action: 'ADMIN_VIEW_REPORTS',
      target_type: 'report',
      status: 'fail',
      reason: err.message,
    });

    return res.status(500).json({ msg: 'Server error' });
  }
};

/* =====================================================
   ADMIN: AUDIT LOGS
===================================================== */

// GET /api/admin/audit-logs
// Query: page, limit, action, status, actorId, targetId, targetType
exports.getAuditLogs = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '25', 10), 1), 200);

    const { action, status, actorId, targetId, targetType } = req.query;

    const filter = {};
    if (action) filter.action = String(action).trim();
    if (status) filter.status = String(status).trim(); // validated in route
    if (targetType) filter.target_type = String(targetType).trim();

    if (actorId && mongoose.Types.ObjectId.isValid(actorId)) {
      filter.actor_user_id = actorId;
    }
    if (targetId && mongoose.Types.ObjectId.isValid(targetId)) {
      filter.target_id = targetId;
    }

    const [items, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      AuditLog.countDocuments(filter),
    ]);

    // Optional: log that audit logs were viewed
    await audit(req, {
      action: 'ADMIN_VIEW_AUDIT_LOGS',
      target_type: 'audit_log',
      status: 'success',
      metadata: { page, limit, total, filter },
    });

    return res.status(200).json({
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      items,
    });
  } catch (err) {
    console.error('Get audit logs error:', err);
    return res.status(500).json({ msg: 'Server error' });
  }
};