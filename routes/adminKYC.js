// backend/routes/adminKYC.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const isAdmin = require('../middleware/isAdmin');
const KYC = require('../models/KYC');
const User = require('../models/User');

// Valid KYC statuses and levels
const KYC_STATUSES = ['not_started', 'in_progress', 'pending_review', 'verified', 'rejected', 'expired'];
const KYC_LEVELS = ['none', 'basic', 'enhanced'];

// Get all pending KYC applications
router.get('/kyc/pending', auth, isAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const kycs = await KYC.find({ status: 'pending_review' })
      .populate('user', 'name email phone createdAt')
      .sort({ submitted_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await KYC.countDocuments({ status: 'pending_review' });

    res.json({
      success: true,
      kycs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching pending KYC:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch pending KYC applications'
    });
  }
});

// Get KYC applications with optional filters
router.get('/kyc/applications', auth, isAdmin, async (req, res) => {
  try {
    const { status, level, page = 1, limit = 20, search } = req.query;
    const skip = (page - 1) * limit;
    const query = {};

    if (status && KYC_STATUSES.includes(status)) query.status = status;
    if (level && KYC_LEVELS.includes(level)) query.level = level;

    if (search) {
      const users = await User.find({
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ]
      }).select('_id');

      query.user = { $in: users.map(u => u._id) };
    }

    const kycs = await KYC.find(query)
      .populate('user', 'name email phone')
      .populate('reviewed_by', 'name email')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await KYC.countDocuments(query);

    res.json({
      success: true,
      kycs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching KYC applications:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch KYC applications'
    });
  }
});

// Get single KYC application details
router.get('/kyc/:id', auth, isAdmin, async (req, res) => {
  try {
    const kyc = await KYC.findById(req.params.id)
      .populate('user', 'name email phone date_of_birth')
      .populate('reviewed_by', 'name email')
      .lean();

    if (!kyc) {
      return res.status(404).json({
        success: false,
        error: 'KYC application not found'
      });
    }

    res.json({
      success: true,
      kyc
    });
  } catch (error) {
    console.error('Error fetching KYC details:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch KYC details'
    });
  }
});

// Approve KYC
router.post('/kyc/:id/approve', auth, isAdmin, async (req, res) => {
  try {
    const { level, notes } = req.body;
    const kyc = await KYC.findById(req.params.id);

    if (!kyc) return res.status(404).json({ success: false, error: 'KYC not found' });
    if (kyc.status === 'verified') return res.status(400).json({ success: false, error: 'KYC already approved' });
    if (kyc.status === 'rejected') return res.status(400).json({ success: false, error: 'Cannot approve rejected KYC' });

    kyc.status = 'verified';
    kyc.level = level || kyc.level;
    kyc.verified_at = new Date();
    kyc.reviewed_by = req.user.id;
    kyc.review_notes = notes;

    kyc.history.push({
      action: 'kyc_approved',
      status: 'verified',
      level: kyc.level,
      performed_by: req.user.id,
      timestamp: new Date(),
      notes: `Approved by admin. ${notes || ''}`
    });

    await kyc.save();

    // Update user's KYC info
    await User.findByIdAndUpdate(kyc.user, {
      'kyc.status': 'verified',
      'kyc.level': kyc.level,
      'kyc.verified_at': new Date()
    });

    res.json({
      success: true,
      message: 'KYC approved successfully',
      kyc: { id: kyc._id, status: kyc.status, level: kyc.level, user: kyc.user, verified_at: kyc.verified_at }
    });
  } catch (error) {
    console.error('Error approving KYC:', error);
    res.status(500).json({ success: false, error: 'Failed to approve KYC' });
  }
});

// Reject KYC
router.post('/kyc/:id/reject', auth, isAdmin, async (req, res) => {
  try {
    const { reason, notes } = req.body;
    if (!reason) return res.status(400).json({ success: false, error: 'Rejection reason is required' });

    const kyc = await KYC.findById(req.params.id);
    if (!kyc) return res.status(404).json({ success: false, error: 'KYC not found' });
    if (kyc.status === 'rejected') return res.status(400).json({ success: false, error: 'KYC already rejected' });
    if (kyc.status === 'verified') return res.status(400).json({ success: false, error: 'Cannot reject approved KYC' });

    kyc.status = 'rejected';
    kyc.rejection_reason = reason;
    kyc.reviewed_by = req.user.id;
    kyc.review_notes = notes;

    kyc.history.push({
      action: 'kyc_rejected',
      status: 'rejected',
      performed_by: req.user.id,
      timestamp: new Date(),
      notes: `Rejected: ${reason}. ${notes || ''}`
    });

    await kyc.save();

    await User.findByIdAndUpdate(kyc.user, {
      'kyc.status': 'rejected',
      'kyc.rejection_reason': reason
    });

    res.json({
      success: true,
      message: 'KYC rejected successfully',
      kyc: { id: kyc._id, status: kyc.status, rejection_reason: reason }
    });
  } catch (error) {
    console.error('Error rejecting KYC:', error);
    res.status(500).json({ success: false, error: 'Failed to reject KYC' });
  }
});

// Export KYC data
router.get('/kyc/export', auth, isAdmin, async (req, res) => {
  try {
    const { format = 'csv', startDate, endDate } = req.query;
    const query = {};

    if (startDate || endDate) {
      query.submitted_at = {};
      if (startDate) query.submitted_at.$gte = new Date(startDate);
      if (endDate) query.submitted_at.$lte = new Date(endDate);
    }

    const kycs = await KYC.find(query)
      .populate('user', 'name email phone')
      .populate('reviewed_by', 'name email')
      .sort({ submitted_at: -1 })
      .lean();

    if (format === 'csv') {
      const csvData = kycs.map(kyc => ({
        'KYC ID': kyc._id,
        'User Name': kyc.user?.name || 'N/A',
        'User Email': kyc.user?.email || 'N/A',
        'Status': kyc.status,
        'Level': kyc.level,
        'Submitted Date': kyc.submitted_at?.toISOString() || 'N/A',
        'Verified Date': kyc.verified_at?.toISOString() || 'N/A',
        'Reviewed By': kyc.reviewed_by?.name || 'N/A',
        'Rejection Reason': kyc.rejection_reason || 'N/A'
      }));

      const csvHeaders = Object.keys(csvData[0] || {}).join(',');
      const csvRows = csvData.map(row =>
        Object.values(row).map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')
      );
      const csvContent = [csvHeaders, ...csvRows].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=kyc_export.csv');
      res.send(csvContent);
    } else {
      res.json({ success: true, kycs });
    }
  } catch (error) {
    console.error('Error exporting KYC:', error);
    res.status(500).json({ success: false, error: 'Failed to export KYC data' });
  }
});

module.exports = router;