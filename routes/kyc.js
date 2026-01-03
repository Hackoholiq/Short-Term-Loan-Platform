// backend/routes/kyc.js
const express = require('express');
const router = express.Router();
const { body, param, validationResult } = require('express-validator');

const auth = require('../middleware/auth');
const upload = require('../middleware/upload');

const {
  uploadKycDocuments,
  getKycRequirements,
  startKyc,
  submitKyc,
  getKycStatus, // ✅ we’ll use this instead of requiring a file inline
} = require('../controllers/kycController');

/* =========================
   VALIDATION MIDDLEWARE
========================= */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ msg: errors.array()[0].msg });
  }
  next();
};

/* =========================
   KYC REQUIREMENTS
   GET /api/kyc/requirements/:amount
========================= */
router.get(
  '/requirements/:amount',
  [param('amount').isNumeric().withMessage('amount must be a number')],
  validate,
  getKycRequirements
);

/* =========================
   START KYC
   POST /api/kyc/start
   body: { level: "basic" | "enhanced" }
========================= */
router.post(
  '/start',
  auth,
  [
    body('level')
      .optional()
      .isIn(['basic', 'enhanced'])
      .withMessage("level must be 'basic' or 'enhanced'"),
  ],
  validate,
  startKyc
);

/* =========================
   UPLOAD KYC DOCUMENTS (multipart)
   POST /api/kyc/documents/upload
   NOTE: field names here MUST match what you append in FormData
========================= */
router.post(
  '/documents/upload',
  auth,
  upload.fields([
    { name: 'front', maxCount: 1 },
    { name: 'back', maxCount: 1 },
    { name: 'selfie', maxCount: 1 },
  ]),
  uploadKycDocuments
);

/* =========================
   SUBMIT KYC FOR REVIEW (JSON payload)
   POST /api/kyc/submit
========================= */
router.post('/submit', auth, submitKyc);

/* =========================
   GET KYC STATUS
   GET /api/kyc/status
========================= */
router.get('/status', auth, getKycStatus);

module.exports = router;