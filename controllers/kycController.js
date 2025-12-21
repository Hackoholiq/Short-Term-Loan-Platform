const User = require('../models/User');

export const uploadKycDocuments = async (req, res) => {
  try {
    console.log('FILES:', req.files); // 👈 DEBUG
    console.log('BODY:', req.body);

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }

    const documents = req.files.map(file => ({
      url: file.path,
      publicId: file.filename,
      type: file.mimetype,
    }));

    return res.status(200).json({
      message: 'KYC upload successful',
      documents,
    });

  } catch (err) {
    console.error('KYC upload error:', err);
    res.status(500).json({ message: 'Upload failed' });
  }
};

// Upload KYC documents
exports.uploadDocuments = async (req, res) => {
  try {
    console.log('KYC upload request received:', req.files?.length, 'files');
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ 
        success: false,
        error: 'NO_FILES',
        message: 'No files uploaded' 
      });
    }

    // Get user
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'USER_NOT_FOUND',
        message: 'User not found' 
      });
    }

    // Update user with file URLs
    const fileUrls = req.files.map(file => `/uploads/kyc/${file.filename}`);
    
    user.kyc = user.kyc || {};
    user.kyc.documents = user.kyc.documents || {};
    
    // Assign files to specific fields
    user.kyc.documents.document_front_url = fileUrls[0];
    if (fileUrls[1]) user.kyc.documents.document_back_url = fileUrls[1];
    if (fileUrls[2]) user.kyc.documents.selfie_with_document_url = fileUrls[2];
    
    user.kyc.status = 'pending_review';
    user.kyc.last_verification_attempt = new Date();
    
    await user.save();

    res.json({
      success: true,
      message: 'Documents uploaded successfully',
      files: req.files.map(file => ({
        fieldname: file.fieldname,
        originalname: file.originalname,
        filename: file.filename,
        size: file.size,
        url: `/uploads/kyc/${file.filename}`
      })),
      kycStatus: user.kyc.status
    });

  } catch (error) {
    console.error('KYC upload error:', error);
    res.status(500).json({ 
      success: false,
      error: 'UPLOAD_ERROR',
      message: error.message 
    });
  }
};

// Get KYC status
exports.getKYCStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('kyc');
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'USER_NOT_FOUND' 
      });
    }

    res.json({
      success: true,
      status: user.kyc?.status || 'not_started',
      level: user.kyc?.level || 'none',
      verified_at: user.kyc?.verified_at,
      documents_uploaded: !!(user.kyc?.documents?.document_front_url)
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: 'SERVER_ERROR',
      message: error.message 
    });
  }
};

// Get KYC requirements for loan amount
exports.getKYCRequirements = async (req, res) => {
  try {
    const loanAmount = parseFloat(req.params.amount) || 0;
    
    let requirement = {
      required: false,
      level: 'none',
      message: 'No KYC verification required'
    };

    if (loanAmount > 5000) {
      requirement = {
        required: true,
        level: 'enhanced',
        message: 'Enhanced KYC required for loans above $5,000'
      };
    } else if (loanAmount > 1000) {
      requirement = {
        required: true,
        level: 'basic',
        message: 'Basic KYC required for loans $1,001 - $5,000'
      };
    }

    res.json({
      success: true,
      ...requirement
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: 'SERVER_ERROR',
      message: error.message 
    });
  }
};

// Get pending KYC (admin)
exports.getPendingKYC = async (req, res) => {
  try {
    // Check if user is admin
    const adminUser = await User.findById(req.user.id);
    if (!adminUser || adminUser.user_type !== 'admin') {
      return res.status(403).json({ 
        success: false,
        error: 'ACCESS_DENIED',
        message: 'Admin access required' 
      });
    }

    const pendingUsers = await User.find({ 
      'kyc.status': 'pending_review' 
    }).select('first_name last_name email kyc.documents created_at');

    res.json({
      success: true,
      count: pendingUsers.length,
      users: pendingUsers
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: 'SERVER_ERROR',
      message: error.message 
    });
  }
};

// Approve KYC (admin)
exports.approveKYC = async (req, res) => {
  try {
    // Check if user is admin
    const adminUser = await User.findById(req.user.id);
    if (!adminUser || adminUser.user_type !== 'admin') {
      return res.status(403).json({ 
        success: false,
        error: 'ACCESS_DENIED',
        message: 'Admin access required' 
      });
    }

    const userId = req.params.userId;
    const { level = 'basic' } = req.body;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'USER_NOT_FOUND',
        message: 'User not found' 
      });
    }

    user.kyc.status = 'verified';
    user.kyc.level = level;
    user.kyc.verified_at = new Date();
    user.kyc.verified_by = req.user.id;
    
    await user.save();

    res.json({
      success: true,
      message: `KYC approved (${level} level)`,
      user: {
        id: user._id,
        name: `${user.first_name} ${user.last_name}`,
        kyc_status: user.kyc.status,
        kyc_level: user.kyc.level
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: 'SERVER_ERROR',
      message: error.message 
    });
  }
};

// Reject KYC (admin)
exports.rejectKYC = async (req, res) => {
  try {
    // Check if user is admin
    const adminUser = await User.findById(req.user.id);
    if (!adminUser || adminUser.user_type !== 'admin') {
      return res.status(403).json({ 
        success: false,
        error: 'ACCESS_DENIED',
        message: 'Admin access required' 
      });
    }

    const userId = req.params.userId;
    const { reason = 'Documents unclear or incomplete' } = req.body;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'USER_NOT_FOUND',
        message: 'User not found' 
      });
    }

    user.kyc.status = 'rejected';
    user.kyc.rejection_reason = reason;
    
    await user.save();

    res.json({
      success: true,
      message: 'KYC rejected',
      user_id: userId,
      reason: reason
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: 'SERVER_ERROR',
      message: error.message 
    });
  }
};

// Submit for verification
exports.submitForVerification = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (!user.kyc.documents?.document_front_url) {
      return res.status(400).json({ 
        success: false,
        error: 'NO_DOCUMENTS',
        message: 'No documents uploaded. Please upload KYC documents first.' 
      });
    }

    user.kyc.status = 'pending_review';
    await user.save();

    res.json({
      success: true,
      message: 'KYC submitted for verification',
      status: user.kyc.status,
      estimated_time: '24-48 hours for review'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: 'SERVER_ERROR',
      message: error.message 
    });
  }
};

// Placeholder for future implementations
exports.startKYCProcess = async (req, res) => {
  res.json({
    success: true,
    message: 'KYC process started',
    status: 'in_progress'
  });
};