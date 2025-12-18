// routes/kycRoutes.js - NEW FILE
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const kycController = require('../controllers/kycController');

// KYC Document Upload
router.post('/documents/upload', auth, upload.array('documents', 3), kycController.uploadDocuments);

// Submit for Verification
router.post('/submit', auth, kycController.submitForVerification);

// Check KYC Status
router.get('/status', auth, kycController.getKYCStatus);

// Admin: Get Pending KYC
router.get('/admin/pending', auth, kycController.getPendingKYC);

// Admin: Approve/Reject KYC
router.post('/admin/:userId/approve', auth, kycController.approveKYC);
router.post('/admin/:userId/reject', auth, kycController.rejectKYC);

module.exports = router;