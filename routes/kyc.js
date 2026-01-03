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
   UPLOAD KYC DOCUMENTS
   POST /api/kyc/documents/upload
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

// Submit KYC for review (JSON payload from Cloudinary widget)
router.post('/submit', auth, async (req, res) => {
  try {
    const { personal_info, address, identity, documents } = req.body || {};

    // Basic validation (keep it light; you can expand later)
    if (!personal_info?.full_name || !personal_info?.date_of_birth || !personal_info?.phone_number) {
      return res.status(400).json({ status: 'error', message: 'Missing personal info' });
    }
    if (!address) {
      return res.status(400).json({ status: 'error', message: 'Missing address' });
    }
    if (!identity?.id_number || !identity?.id_type || !identity?.id_document?.url) {
      return res.status(400).json({ status: 'error', message: 'Missing identity document' });
    }
    if (!documents?.proof_of_address?.url) {
      return res.status(400).json({ status: 'error', message: 'Missing proof of address' });
    }

    // Upsert KYC record for user
    const update = {
      user: req.user.id,
      status: 'pending_review',
      level: req.body?.verification_context?.kyc_level_required || 'basic',
      submitted_at: new Date(),

      personal_info: {
        full_name: personal_info.full_name,
        date_of_birth: personal_info.date_of_birth,
        // store phone in a safe place (your schema currently has no phone field)
      },

      address_verification: {
        current_address: { street: address }, // simple mapping since your frontend uses 1 textarea string
        proof_document: documents.proof_of_address.url,
      },

      id_verification: {
        document_type: identity.id_type,
        document_number: identity.id_number,
        document_images: [identity.id_document.url],
      },

      // optional
      financial_info: documents?.income_proof?.url
        ? { income_proof: documents.income_proof.url }
        : undefined,

      biometric_verification: documents?.selfie?.url
        ? { liveness_check: true } // placeholder
        : undefined,
    };

    const kyc = await KYC.findOneAndUpdate(
      { user: req.user.id },
      { $set: update },
      { new: true, upsert: true }
    );

    return res.status(200).json({
      status: 'success',
      message: 'KYC submitted for review',
      data: {
        status: kyc.status,
        level: kyc.level,
        submitted_at: kyc.submitted_at,
      },
    });
  } catch (error) {
    console.error('KYC submit error:', error);
    return res.status(500).json({ status: 'error', message: 'Server error' });
  }
});

/* =========================
   SUBMIT KYC FOR REVIEW
   POST /api/kyc/submit
========================= */
router.post('/submit', auth, submitKyc);

/* =========================
   GET KYC STATUS
   GET /api/kyc/status
========================= */
router.get('/status', auth, require('../controllers/kycStatusController'));

module.exports = router;