// routes/kyc.js
const express = require('express');
const router = express.Router();

const upload = require('../middleware/upload');
const auth = require('../middleware/auth');
const { uploadKycDocuments, getKycStatus } = require('../controllers/kycController');

// POST /kyc/documents/upload
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

// GET /kyc/status
router.get('/status', auth, getKycStatus);

module.exports = router;