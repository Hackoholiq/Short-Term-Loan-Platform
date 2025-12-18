const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const KYC = require('../models/KYC');
const User = require('../models/User');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../uploads/kyc');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `${req.user.id}-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, and PDF files are allowed'));
    }
  }
});

// 1. Start KYC Process
router.post('/start', auth, async (req, res) => {
  try {
    const { level = 'basic' } = req.body;
    
    let kyc = await KYC.findOne({ user: req.user.id });
    
    if (!kyc) {
      kyc = new KYC({
        user: req.user.id,
        level: level,
        status: 'in_progress',
        history: [{
          action: 'kyc_started',
          status: 'in_progress',
          level: level,
          performed_by: req.user.id,
          timestamp: new Date(),
          notes: 'User initiated KYC process'
        }]
      });
    } else {
      kyc.level = level;
      kyc.status = 'in_progress';
      kyc.history.push({
        action: 'kyc_restarted',
        status: 'in_progress',
        level: level,
        performed_by: req.user.id,
        timestamp: new Date(),
        notes: 'User restarted KYC process'
      });
    }
    
    await kyc.save();
    
    res.json({
      success: true,
      message: 'KYC process started',
      kyc: {
        status: kyc.status,
        level: kyc.level,
        next_step: 'id_verification'
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Upload ID Documents
router.post('/upload/id', auth, upload.array('documents', 3), async (req, res) => {
  try {
    const { document_type, document_number, issue_date, expiry_date, issuing_country } = req.body;
    
    const kyc = await KYC.findOne({ user: req.user.id });
    if (!kyc) return res.status(404).json({ error: 'KYC record not found' });
    
    // Save document paths
    const document_images = req.files.map(file => `/uploads/kyc/${file.filename}`);
    
    kyc.id_verification = {
      document_type,
      document_number,
      issue_date,
      expiry_date,
      issuing_country,
      document_images,
      verified: false
    };
    
    kyc.history.push({
      action: 'id_documents_uploaded',
      status: kyc.status,
      performed_by: req.user.id,
      timestamp: new Date(),
      notes: `Uploaded ${document_type} documents`
    });
    
    await kyc.save();
    
    // TODO: Integrate with OCR/ID verification service (like Jumio, Onfido, Shufti Pro)
    // await verifyIDWithService(kyc.id_verification);
    
    res.json({
      success: true,
      message: 'ID documents uploaded successfully',
      next_step: 'address_verification'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Upload Address Proof
router.post('/upload/address', auth, upload.single('document'), async (req, res) => {
  try {
    const { street, city, state, country, postal_code, proof_type } = req.body;
    
    const kyc = await KYC.findOne({ user: req.user.id });
    if (!kyc) return res.status(404).json({ error: 'KYC record not found' });
    
    kyc.address_verification = {
      current_address: { street, city, state, country, postal_code },
      proof_type,
      proof_document: `/uploads/kyc/${req.file.filename}`,
      verified: false
    };
    
    kyc.history.push({
      action: 'address_proof_uploaded',
      status: kyc.status,
      performed_by: req.user.id,
      timestamp: new Date(),
      notes: `Uploaded ${proof_type} for address verification`
    });
    
    await kyc.save();
    
    // TODO: Verify address with external service
    // await verifyAddressWithService(kyc.address_verification);
    
    res.json({
      success: true,
      message: 'Address proof uploaded successfully',
      next_step: kyc.level === 'enhanced' ? 'financial_info' : 'liveness_check'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Submit Financial Information (Enhanced KYC)
router.post('/submit/financial', auth, upload.single('income_proof'), async (req, res) => {
  try {
    const { employment_status, occupation, employer_name, monthly_income, income_source } = req.body;
    
    const kyc = await KYC.findOne({ user: req.user.id });
    if (!kyc) return res.status(404).json({ error: 'KYC record not found' });
    
    kyc.financial_info = {
      employment_status,
      occupation,
      employer_name,
      monthly_income: parseFloat(monthly_income),
      income_source,
      income_proof: req.file ? `/uploads/kyc/${req.file.filename}` : null,
      verified: false
    };
    
    kyc.history.push({
      action: 'financial_info_submitted',
      status: kyc.status,
      performed_by: req.user.id,
      timestamp: new Date(),
      notes: 'Submitted financial information'
    });
    
    await kyc.save();
    
    res.json({
      success: true,
      message: 'Financial information submitted',
      next_step: 'liveness_check'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. Perform Liveness Check (Webcam/Facial Recognition)
router.post('/liveness-check', auth, upload.single('video'), async (req, res) => {
  try {
    // This would integrate with a facial recognition service
    // For now, simulate the process
    
    const kyc = await KYC.findOne({ user: req.user.id });
    if (!kyc) return res.status(404).json({ error: 'KYC record not found' });
    
    // Simulate facial recognition
    const videoPath = req.file ? `/uploads/kyc/${req.file.filename}` : null;
    
    kyc.biometric_verification = {
      liveness_check: true,
      facial_recognition_match: true, // Would be determined by AI service
      confidence_score: 0.95, // AI confidence score
      verification_date: new Date()
    };
    
    kyc.status = 'pending_review';
    kyc.submitted_at = new Date();
    
    kyc.history.push({
      action: 'liveness_check_completed',
      status: 'pending_review',
      performed_by: req.user.id,
      timestamp: new Date(),
      notes: 'Completed biometric verification'
    });
    
    await kyc.save();
    
    // Update user's KYC status
    await User.findByIdAndUpdate(req.user.id, {
      'kyc.status': 'pending_review',
      'kyc.level': kyc.level
    });
    
    res.json({
      success: true,
      message: 'Liveness check completed. Your KYC is now pending admin review.',
      status: 'pending_review'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 6. Submit for Final Review
router.post('/submit', auth, async (req, res) => {
  try {
    const kyc = await KYC.findOne({ user: req.user.id });
    if (!kyc) return res.status(404).json({ error: 'KYC record not found' });
    
    // Check if all required steps are completed
    const stepsCompleted = [
      kyc.id_verification?.document_images?.length > 0,
      kyc.address_verification?.proof_document,
      kyc.level === 'basic' || kyc.financial_info?.income_proof,
      kyc.biometric_verification?.liveness_check
    ].every(Boolean);
    
    if (!stepsCompleted) {
      return res.status(400).json({
        error: 'Please complete all verification steps before submitting'
      });
    }
    
    kyc.status = 'pending_review';
    kyc.submitted_at = new Date();
    
    kyc.history.push({
      action: 'kyc_submitted_for_review',
      status: 'pending_review',
      performed_by: req.user.id,
      timestamp: new Date(),
      notes: 'Submitted KYC for admin review'
    });
    
    await kyc.save();
    
    // Update user
    await User.findByIdAndUpdate(req.user.id, {
      'kyc.status': 'pending_review'
    });
    
    // TODO: Notify admins about new KYC submission
    
    res.json({
      success: true,
      message: 'KYC submitted successfully. It will be reviewed within 24-48 hours.',
      status: 'pending_review'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 7. Get KYC Status
router.get('/status', auth, async (req, res) => {
  try {
    const kyc = await KYC.findOne({ user: req.user.id })
      .populate('reviewed_by', 'name email')
      .select('-history -__v');
    
    if (!kyc) {
      return res.json({
        status: 'not_started',
        level: 'none',
        message: 'KYC not started'
      });
    }
    
    // Determine next step
    let next_step = 'complete';
    if (!kyc.id_verification?.document_images) next_step = 'id_verification';
    else if (!kyc.address_verification?.proof_document) next_step = 'address_verification';
    else if (kyc.level === 'enhanced' && !kyc.financial_info?.income_proof) next_step = 'financial_info';
    else if (!kyc.biometric_verification?.liveness_check) next_step = 'liveness_check';
    else if (kyc.status === 'in_progress') next_step = 'submit';
    
    res.json({
      ...kyc.toObject(),
      next_step,
      progress: calculateKYCProgress(kyc)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 8. Check KYC Requirement for Loan Amount
router.get('/requirements/:amount', auth, async (req, res) => {
  try {
    const loanAmount = parseFloat(req.params.amount);
    
    let required = false;
    let level = 'none';
    let message = '';
    
    // Business logic for KYC requirements
    if (loanAmount > 10000) {
      required = true;
      level = 'enhanced';
      message = 'Enhanced KYC required for loans above $10,000';
    } else if (loanAmount > 5000) {
      required = true;
      level = 'enhanced';
      message = 'Enhanced KYC required for loans above $5,000';
    } else if (loanAmount > 1000) {
      required = true;
      level = 'basic';
      message = 'Basic KYC required for loans above $1,000';
    }
    
    // Check user's current KYC status
    const kyc = await KYC.findOne({ user: req.user.id });
    const userKYC = kyc ? {
      status: kyc.status,
      level: kyc.level,
      verified: kyc.status === 'verified'
    } : null;
    
    res.json({
      required,
      level,
      message,
      user_kyc: userKYC,
      compliant: !required || (userKYC?.verified && userKYC.level === level)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper function to calculate progress
function calculateKYCProgress(kyc) {
  let steps = 0;
  let completed = 0;
  
  // ID verification
  steps++; completed += kyc.id_verification?.document_images ? 1 : 0;
  
  // Address verification
  steps++; completed += kyc.address_verification?.proof_document ? 1 : 0;
  
  // Financial info (if enhanced)
  if (kyc.level === 'enhanced') {
    steps++; completed += kyc.financial_info?.income_proof ? 1 : 0;
  }
  
  // Liveness check
  steps++; completed += kyc.biometric_verification?.liveness_check ? 1 : 0;
  
  return {
    percentage: Math.round((completed / steps) * 100),
    steps,
    completed
  };
}

module.exports = router;