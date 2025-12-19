const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const isAdmin = require('../middleware/isAdmin');
const KYC = require('../models/KYC');
const User = require('../models/User');

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
      .limit(limit);
    
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

// Get all KYC applications with filtering
router.get('/kyc/applications', auth, isAdmin, async (req, res) => {
  try {
    const { status, level, page = 1, limit = 20, search } = req.query;
    const skip = (page - 1) * limit;
    
    // Build query
    const query = {};
    if (status) query.status = status;
    if (level) query.level = level;
    
    // Search by user name or email
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
      .limit(parseInt(limit));
    
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
      .populate('reviewed_by', 'name email');
    
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

// Approve KYC application
router.post('/kyc/:id/approve', auth, isAdmin, async (req, res) => {
  try {
    const { level, notes } = req.body;
    
    const kyc = await KYC.findById(req.params.id);
    if (!kyc) {
      return res.status(404).json({
        success: false,
        error: 'KYC application not found'
      });
    }
    
    // Check if already processed
    if (kyc.status === 'verified') {
      return res.status(400).json({
        success: false,
        error: 'KYC already approved'
      });
    }
    
    if (kyc.status === 'rejected') {
      return res.status(400).json({
        success: false,
        error: 'Cannot approve a rejected KYC'
      });
    }
    
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
    
    // Update user's KYC status
    await User.findByIdAndUpdate(kyc.user, {
      'kyc.status': 'verified',
      'kyc.level': kyc.level,
      'kyc.verified_at': new Date()
    });
    
    res.json({
      success: true,
      message: 'KYC approved successfully',
      kyc: {
        id: kyc._id,
        status: kyc.status,
        level: kyc.level,
        user: kyc.user,
        verified_at: kyc.verified_at
      }
    });
  } catch (error) {
    console.error('Error approving KYC:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to approve KYC' 
    });
  }
});

// Reject KYC application
router.post('/kyc/:id/reject', auth, isAdmin, async (req, res) => {
  try {
    const { reason, notes } = req.body;
    
    if (!reason) {
      return res.status(400).json({
        success: false,
        error: 'Rejection reason is required'
      });
    }
    
    const kyc = await KYC.findById(req.params.id);
    if (!kyc) {
      return res.status(404).json({
        success: false,
        error: 'KYC application not found'
      });
    }
    
    // Check if already processed
    if (kyc.status === 'rejected') {
      return res.status(400).json({
        success: false,
        error: 'KYC already rejected'
      });
    }
    
    if (kyc.status === 'verified') {
      return res.status(400).json({
        success: false,
        error: 'Cannot reject an approved KYC'
      });
    }
    
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
    
    // Update user
    await User.findByIdAndUpdate(kyc.user, {
      'kyc.status': 'rejected',
      'kyc.rejection_reason': reason
    });
    
    res.json({
      success: true,
      message: 'KYC rejected',
      kyc: {
        id: kyc._id,
        status: kyc.status,
        rejection_reason: reason
      }
    });
  } catch (error) {
    console.error('Error rejecting KYC:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to reject KYC' 
    });
  }
});

// Get KYC documents for review
router.get('/kyc/:id/documents', auth, isAdmin, async (req, res) => {
  try {
    const kyc = await KYC.findById(req.params.id)
      .select('id_verification.document_images address_verification.proof_document financial_info.income_proof');
    
    if (!kyc) {
      return res.status(404).json({
        success: false,
        error: 'KYC application not found'
      });
    }
    
    const documents = {
      id_documents: kyc.id_verification?.document_images || [],
      address_proof: kyc.address_verification?.proof_document || null,
      income_proof: kyc.financial_info?.income_proof || null
    };
    
    res.json({
      success: true,
      documents
    });
  } catch (error) {
    console.error('Error fetching KYC documents:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch KYC documents' 
    });
  }
});

// Request additional documents
router.post('/kyc/:id/request-documents', auth, isAdmin, async (req, res) => {
  try {
    const { document_type, message } = req.body;
    
    const kyc = await KYC.findById(req.params.id);
    if (!kyc) {
      return res.status(404).json({
        success: false,
        error: 'KYC application not found'
      });
    }
    
    kyc.history.push({
      action: 'additional_documents_requested',
      status: kyc.status,
      performed_by: req.user.id,
      timestamp: new Date(),
      notes: `Requested ${document_type}: ${message}`
    });
    
    await kyc.save();
    
    // TODO: Send notification to user
    
    res.json({
      success: true,
      message: 'Document request sent to user'
    });
  } catch (error) {
    console.error('Error requesting additional documents:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to request additional documents' 
    });
  }
});

// Update KYC level
router.put('/kyc/:id/level', auth, isAdmin, async (req, res) => {
  try {
    const { level } = req.body;
    
    if (!['none', 'basic', 'enhanced'].includes(level)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid KYC level'
      });
    }
    
    const kyc = await KYC.findById(req.params.id);
    if (!kyc) {
      return res.status(404).json({
        success: false,
        error: 'KYC application not found'
      });
    }
    
    const oldLevel = kyc.level;
    kyc.level = level;
    
    kyc.history.push({
      action: 'kyc_level_updated',
      status: kyc.status,
      performed_by: req.user.id,
      timestamp: new Date(),
      notes: `Level changed from ${oldLevel} to ${level}`
    });
    
    await kyc.save();
    
    // Update user if KYC is verified
    if (kyc.status === 'verified') {
      await User.findByIdAndUpdate(kyc.user, {
        'kyc.level': level
      });
    }
    
    res.json({
      success: true,
      message: 'KYC level updated',
      kyc: {
        id: kyc._id,
        level: kyc.level
      }
    });
  } catch (error) {
    console.error('Error updating KYC level:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to update KYC level' 
    });
  }
});

// Get KYC statistics
router.get('/kyc/stats', auth, isAdmin, async (req, res) => {
  try {
    const total = await KYC.countDocuments();
    const pending = await KYC.countDocuments({ status: 'pending_review' });
    const verified = await KYC.countDocuments({ status: 'verified' });
    const rejected = await KYC.countDocuments({ status: 'rejected' });
    const inProgress = await KYC.countDocuments({ status: 'in_progress' });
    
    const basicCount = await KYC.countDocuments({ level: 'basic' });
    const enhancedCount = await KYC.countDocuments({ level: 'enhanced' });
    
    // Recent activity (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const recentSubmissions = await KYC.countDocuments({
      submitted_at: { $gte: sevenDaysAgo }
    });
    
    const recentApprovals = await KYC.countDocuments({
      verified_at: { $gte: sevenDaysAgo },
      status: 'verified'
    });
    
    // Calculate approval rate
    const processedCount = verified + rejected;
    const approvalRate = processedCount > 0 ? (verified / processedCount) * 100 : 0;
    
    // Average processing time (for approved applications)
    const approvedKYCs = await KYC.find({ 
      status: 'verified',
      submitted_at: { $exists: true },
      verified_at: { $exists: true }
    });
    
    let totalProcessingTime = 0;
    approvedKYCs.forEach(kyc => {
      const processingTime = new Date(kyc.verified_at) - new Date(kyc.submitted_at);
      totalProcessingTime += processingTime;
    });
    
    const avgProcessingTimeHours = approvedKYCs.length > 0 
      ? (totalProcessingTime / approvedKYCs.length) / (1000 * 60 * 60)
      : 0;
    
    res.json({
      success: true,
      stats: {
        total,
        pending,
        verified,
        rejected,
        in_progress: inProgress,
        basic: basicCount,
        enhanced: enhancedCount,
        recent_submissions: recentSubmissions,
        recent_approvals: recentApprovals,
        approval_rate: approvalRate.toFixed(2),
        avg_processing_time_hours: avgProcessingTimeHours.toFixed(2)
      }
    });
  } catch (error) {
    console.error('Error fetching KYC stats:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch KYC statistics' 
    });
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
      .sort({ submitted_at: -1 });
    
    if (format === 'csv') {
      // Convert to CSV
      const csvData = kycs.map(kyc => ({
        'KYC ID': kyc._id,
        'User Name': kyc.user?.name || 'N/A',
        'User Email': kyc.user?.email || 'N/A',
        'Status': kyc.status,
        'Level': kyc.level,
        'Submitted Date': kyc.submitted_at ? new Date(kyc.submitted_at).toISOString() : 'N/A',
        'Verified Date': kyc.verified_at ? new Date(kyc.verified_at).toISOString() : 'N/A',
        'Reviewed By': kyc.reviewed_by?.name || 'N/A',
        'Rejection Reason': kyc.rejection_reason || 'N/A'
      }));
      
      // Convert to CSV string
      const csvHeaders = Object.keys(csvData[0] || {}).join(',');
      const csvRows = csvData.map(row => Object.values(row).map(value => 
        `"${String(value).replace(/"/g, '""')}"`
      ).join(','));
      
      const csvContent = [csvHeaders, ...csvRows].join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=kyc_export.csv');
      res.send(csvContent);
    } else {
      // Return JSON
      res.json({
        success: true,
        kycs
      });
    }
  } catch (error) {
    console.error('Error exporting KYC data:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to export KYC data' 
    });
  }
});

module.exports = router;