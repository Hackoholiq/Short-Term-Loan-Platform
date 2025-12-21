// routes/kyc.js
const express = require('express');
const router = express.Router();

const upload = require('../middleware/upload');
const { uploadKycDocuments } = require('../controllers/kycController');
const auth = require('../middleware/auth');

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

router.get('/status', auth, async (req, res) => {
  res.json({ status: 'pending' });
});

module.exports = router;