// controllers/kycController.js
const KYC = require('../models/KYC');
const User = require('../models/User');

/* =========================
   Helpers
========================= */
const safeLevel = (level) => {
  const l = String(level || 'basic').toLowerCase();
  // KYC model allows: none/basic/enhanced
  if (l === 'enhanced') return 'enhanced';
  if (l === 'basic') return 'basic';
  if (l === 'none') return 'none';
  return 'basic';
};

const pickFileUrl = (file) => {
  // With Cloudinary+multer-storage-cloudinary, file.path is often the hosted URL.
  return file?.path || file?.secure_url || file?.url || null;
};

const parseDobToDate = (dobStr) => {
  // accepts "YYYY-MM-DD" or "DD/MM/YYYY" (and falls back to Date parse)
  if (!dobStr) return null;
  const s = String(dobStr).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const dt = new Date(`${s}T00:00:00.000Z`);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [dd, mm, yyyy] = s.split('/');
    const dt = new Date(`${yyyy}-${mm}-${dd}T00:00:00.000Z`);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? null : dt;
};

const mapIdType = (t) => {
  const v = String(t || '').toLowerCase();

  // KYC model expects:
  // passport | national_id | drivers_license | voters_card | other
  if (['passport', 'national_id', 'drivers_license', 'voters_card', 'other'].includes(v)) return v;

  // common frontend variants
  if (v === 'drivers_licence' || v === 'driver_licence' || v === 'driver_license') return 'drivers_license';
  if (v === 'nationalid' || v === 'national-id') return 'national_id';

  return 'other';
};

const normalizeKycResponse = (kyc) => ({
  status: kyc?.status || 'not_started',
  level: kyc?.level || 'none',
  submitted_at: kyc?.submitted_at || null,
  verified_at: kyc?.verified_at || null,
});

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
    if (!userId) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

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

    return res.json(normalizeKycResponse(kyc));
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
    if (!userId) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

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

    // NOTE: we do NOT force level/basic here — keep whatever level is already started
    const existing = await KYC.findOne({ user: userId }).select('level status').lean();
    const currentLevel = existing?.level || 'basic';

    const kyc = await KYC.findOneAndUpdate(
      { user: userId },
      {
        $setOnInsert: { user: userId, status: 'in_progress', level: currentLevel },
        $addToSet: { 'id_verification.document_images': { $each: newDocUrls } },
        $push: {
          history: {
            action: 'UPLOAD_DOCUMENTS',
            status: 'in_progress',
            level: currentLevel,
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
        ...normalizeKycResponse(kyc),
        document_images: kyc.id_verification?.document_images || [],
      },
    });
  } catch (error) {
    console.error('🔥 KYC UPLOAD ERROR:', error);
    return res.status(500).json({ status: 'error', message: error.message });
  }
};

/* =========================
   POST /api/kyc/submit  (JSON from Cloudinary widget)
========================= */
exports.submitKyc = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

    const { personal_info, address, identity, documents, verification_context } = req.body || {};

    const level = safeLevel(verification_context?.kyc_level_required);

    // ---------- validation ----------
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

    // Enhanced must include selfie (server-side enforcement)
    if (level === 'enhanced' && !documents?.selfie?.url) {
      return res.status(400).json({ status: 'error', message: 'Enhanced KYC requires a selfie upload' });
    }

    const dobDate = parseDobToDate(personal_info.date_of_birth);
    if (!dobDate) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid date_of_birth format (use YYYY-MM-DD or DD/MM/YYYY)',
      });
    }

    // ---------- build KYC update (MATCHES models/KYC.js) ----------
    const kycUpdate = {
      user: userId,
      status: 'pending_review',
      level,
      submitted_at: new Date(),

      personal_info: {
        full_name: personal_info.full_name,
        date_of_birth: dobDate,
      },

      address_verification: {
        current_address: {
          street: address,
        },
        proof_document: documents.proof_of_address.url,
        verified: false,
      },

      id_verification: {
        document_type: mapIdType(identity.id_type),
        document_number: identity.id_number,
        document_images: [identity.id_document.url],
        verified: false,
      },
    };

    if (documents?.income_proof?.url) {
      kycUpdate.financial_info = {
        income_proof: documents.income_proof.url,
        verified: false,
      };
    }

    if (documents?.selfie?.url) {
      kycUpdate.biometric_verification = {
        liveness_check: true,
        verification_date: null,
      };
    }

    // ---------- upsert KYC application ----------
    const kyc = await KYC.findOneAndUpdate(
      { user: userId },
      {
        $set: kycUpdate,
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

    // ---------- sync key fields to User model ----------
    const userUpdate = {
      phone: personal_info.phone_number,
      address: address,
      date_of_birth: dobDate,

      'kyc.status': 'pending_review',
      'kyc.level': level,

      'kyc.documents.document_type': mapIdType(identity.id_type),
      'kyc.documents.document_number': identity.id_number,

      'kyc.documents.document_front_url': identity.id_document.url,
      'kyc.documents.proof_of_address_url': documents.proof_of_address.url,
      'kyc.documents.document_verified_at': new Date(),
    };

    if (documents?.selfie?.url) userUpdate['kyc.documents.selfie_with_document_url'] = documents.selfie.url;

    // Optional: back image if you ever add it in UI payload
    if (identity?.id_document_back?.url) userUpdate['kyc.documents.document_back_url'] = identity.id_document_back.url;

    await User.findByIdAndUpdate(userId, { $set: userUpdate });

    return res.status(200).json({
      status: 'success',
      message: 'KYC submitted for review',
      data: normalizeKycResponse(kyc),
    });
  } catch (err) {
    console.error('submitKyc error:', err);
    return res.status(500).json({ status: 'error', message: 'Server error', error: err.message });
  }
};

/* =========================
   GET /api/kyc/status
========================= */
exports.getKycStatus = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

    const kyc = await KYC.findOne({ user: userId }).lean();

    if (!kyc) {
      return res.json({ status: 'not_started', level: 'none', submitted_at: null, verified_at: null });
    }

    return res.json(normalizeKycResponse(kyc));
  } catch (error) {
    console.error('KYC status fetch error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to fetch KYC status' });
  }
};