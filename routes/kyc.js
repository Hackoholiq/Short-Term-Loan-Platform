// backend/routes/kyc.js
const express = require('express');
const router = express.Router();

const upload = require('../middleware/upload');
const { uploadKycDocuments } = require('../controllers/kycController');
const auth = require('../middleware/auth');
const KYC = require('../models/KYC');

// Upload KYC documents
router.post(
  '/documents/upload',
  auth,
  upload.fields([
    { name: 'front', maxCount: 1 },
    { name: 'back', maxCount: 1 },
    { name: 'selfie', maxCount: 1 }
  ]),
  uploadKycDocuments
);

// Get KYC status for the logged-in user
router.get('/status', auth, async (req, res) => {
  try {
    const kyc = await KYC.findOne({ user: req.user.id }).lean();

    if (!kyc) {
      return res.json({
        status: 'not_started'
      });
    }

    res.json({
      status: kyc.status || 'not_started',
      level: kyc.level || 'none',
      submitted_at: kyc.submitted_at || null,
      verified_at: kyc.verified_at || null
    });
  } catch (error) {
    console.error('Error fetching KYC status:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch KYC status'
    });
  }
});

module.exports = router;