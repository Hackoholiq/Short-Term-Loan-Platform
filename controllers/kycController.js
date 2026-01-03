// controllers/kycController.js
const KYC = require('../models/KYC');
const User = require('../models/User');

/* =========================
   Helpers
========================= */
const safeLevel = (level) => {
  const l = String(level || 'basic').toLowerCase();
  return ['basic', 'enhanced'].includes(l) ? l : 'basic';
};

const pickFileUrl = (file) => {
  // With Cloudinary+multer-storage-cloudinary, file.path is often the hosted URL.
  return file?.path || file?.secure_url || file?.url || null;
};

/* =========================
   GET /api/kyc/requirements/:amount
========================= */
exports.getKycRequirements = async (req, res) => {
  const amount = Number(req.params.amount || 0);

  if (!Number.isFinite(amount) || amount < 0) {
    return res.status(400).json({ msg: 'Invalid amount' });
  }

  if (amount > 5000) {
    return res.json({ required: true, level: 'enhanced', message: 'Enhanced KYC required' });
  }

  if (amount > 1000) {
    return res.json({ required: true, level: 'basic', message: 'Basic KYC required' });
  }

  return res.json({ required: false, level: 'none', message: 'No KYC required' });
};

/* =========================
   POST /api/kyc/start
   body: { level?: "basic" | "enhanced" }
========================= */
exports.startKyc = async (req, res) => {
  try {
    const userId = req.user?.id;
    const level = safeLevel(req.body?.level);

    const kyc = await KYC.findOneAndUpdate(
      { user: userId },
      {
        $set: {
          user: userId,
          level,
          status: 'in_progress',
        },
        $push: {
          history: {
            action: 'START_KYC',
            status: 'in_progress',
            level,
            performed_by: userId,
            notes: `User started KYC at level ${level}`,
          },
        },
      },
      { upsert: true, new: true }
    );

    // Keep User model in sync for dashboard
    await User.findByIdAndUpdate(userId, {
      $set: { 'kyc.status': 'in_progress', 'kyc.level': level },
    });

    return res.json({
      status: kyc.status,
      level: kyc.level,
      submitted_at: kyc.submitted_at || null,
      verified_at: kyc.verified_at || null,
    });
  } catch (err) {
    console.error('startKyc error:', err);
    return res.status(500).json({ msg: 'Server error' });
  }
};

/* =========================
   POST /api/kyc/documents/upload  (multipart)
   fields: front, back, selfie
========================= */
exports.uploadKycDocuments = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({ status: 'error', message: 'No files uploaded' });
    }

    const frontUrl = pickFileUrl(req.files?.front?.[0]);
    const backUrl = pickFileUrl(req.files?.back?.[0]);
    const selfieUrl = pickFileUrl(req.files?.selfie?.[0]);

    const newDocUrls = [frontUrl, backUrl, selfieUrl].filter(Boolean);

    if (newDocUrls.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Files were received but no valid URLs were produced.',
      });
    }

    const kyc = await KYC.findOneAndUpdate(
      { user: userId },
      {
        $setOnInsert: { user: userId, status: 'in_progress', level: 'basic' },
        $addToSet: { 'id_verification.document_images': { $each: newDocUrls } },
        $push: {
          history: {
            action: 'UPLOAD_DOCUMENTS',
            status: 'in_progress',
            level: 'basic',
            performed_by: userId,
            notes: `Uploaded: ${Object.keys(req.files).join(', ')}`,
          },
        },
      },
      { upsert: true, new: true }
    );

    await User.findByIdAndUpdate(userId, {
      $set: { 'kyc.status': kyc.status, 'kyc.level': kyc.level },
    });

    return res.status(201).json({
      status: 'success',
      message: 'KYC documents uploaded successfully',
      data: {
        status: kyc.status,
        level: kyc.level,
        document_images: kyc.id_verification?.document_images || [],
        submitted_at: kyc.submitted_at || null,
        verified_at: kyc.verified_at || null,
      },
    });
  } catch (error) {
    console.error('🔥 KYC UPLOAD ERROR:', error);
    return res.status(500).json({ status: 'error', message: error.message });
  }
};

/* =========================
   POST /api/kyc/submit  (JSON from Cloudinary widget)
   Matches your KYCVerify.js payload:
   {
     personal_info:{ full_name,date_of_birth,phone_number },
     address: "...",
     identity:{ id_type,id_number,id_document:{url,...} },
     documents:{ proof_of_address:{url,...}, income_proof?, selfie? },
     verification_context:{ kyc_level_required }
   }
========================= */
exports.submitKyc = async (req, res) => {
  try {
    const userId = req.user?.id;

    const { personal_info, address, identity, documents, verification_context } = req.body || {};

    // Light validation
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

    const level = safeLevel(verification_context?.kyc_level_required);

    const update = {
      user: userId,
      status: 'pending_review',
      level,
      submitted_at: new Date(),

      personal_info: {
        full_name: personal_info.full_name,
        date_of_birth: personal_info.date_of_birth,
        // NOTE: your KYC schema doesn't have phone_number in personal_info
      },

      address_verification: {
        current_address: { street: address },
        proof_document: documents.proof_of_address.url,
      },

      id_verification: {
        document_type: identity.id_type,
        document_number: identity.id_number,
        document_images: [identity.id_document.url],
      },

      financial_info: documents?.income_proof?.url
        ? { income_proof: documents.income_proof.url }
        : undefined,

      biometric_verification: documents?.selfie?.url
        ? { liveness_check: true }
        : undefined,
    };

    const kyc = await KYC.findOneAndUpdate(
      { user: userId },
      {
        $set: update,
        $push: {
          history: {
            action: 'SUBMIT_KYC',
            status: 'pending_review',
            level,
            performed_by: userId,
            notes: 'User submitted KYC for review (Cloudinary payload)',
          },
        },
      },
      { upsert: true, new: true }
    );

    // Sync user.kyc for dashboard
    await User.findByIdAndUpdate(userId, {
      $set: { 'kyc.status': 'pending_review', 'kyc.level': level },
    });

    return res.status(200).json({
      status: 'success',
      message: 'KYC submitted for review',
      data: {
        status: kyc.status,
        level: kyc.level,
        submitted_at: kyc.submitted_at,
        verified_at: kyc.verified_at || null,
      },
    });
  } catch (err) {
    console.error('submitKyc error:', err);
    return res.status(500).json({ status: 'error', message: 'Server error', error: err.message });
  }
};

/* =========================
   GET /api/kyc/status
   Used by Dashboard (apiService.kyc.getStatus)
========================= */
exports.getKycStatus = async (req, res) => {
  try {
    const kyc = await KYC.findOne({ user: req.user.id }).lean();

    if (!kyc) {
      return res.json({ status: 'not_started', level: 'none', submitted_at: null, verified_at: null });
    }

    return res.json({
      status: kyc.status || 'not_started',
      level: kyc.level || 'none',
      submitted_at: kyc.submitted_at || null,
      verified_at: kyc.verified_at || null,
    });
  } catch (error) {
    console.error('KYC status fetch error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to fetch KYC status' });
  }
};