const KYC = require('../models/KYC');
const User = require('../models/User');


// controllers/kycController.js
const KYC = require('../models/KYC');
const User = require('../models/User');

exports.startKyc = async (req, res) => {
  try {
    const userId = req.user?.id;
    const level = String(req.body?.level || 'basic').toLowerCase();

    const safeLevel = ['basic', 'enhanced'].includes(level) ? level : 'basic';

    const kyc = await KYC.findOneAndUpdate(
      { user: userId },
      {
        $set: {
          user: userId,
          level: safeLevel,
          status: 'in_progress',
        },
        $push: {
          history: {
            action: 'START_KYC',
            status: 'in_progress',
            level: safeLevel,
            performed_by: userId,
            notes: `User started KYC at level ${safeLevel}`,
          },
        },
      },
      { upsert: true, new: true }
    );

    // Optional sync to User model (your dashboard sometimes reads user.kyc.*)
    await User.findByIdAndUpdate(userId, {
      $set: { 'kyc.status': 'in_progress', 'kyc.level': safeLevel },
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

// Upload KYC documents
const KYC = require('../models/KYC');
const User = require('../models/User');

const pickFileUrl = (file) => {
  // With Cloudinary+multer-storage-cloudinary, file.path is usually the hosted URL.
  // Fallback to file.secure_url if your config uses that.
  return file?.path || file?.secure_url || file?.url || null;
};

exports.uploadKycDocuments = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'No files uploaded',
      });
    }

    // Your route uses upload.fields([{name:'front'},{name:'back'},{name:'selfie'}])
    const frontFile = req.files?.front?.[0];
    const backFile = req.files?.back?.[0];
    const selfieFile = req.files?.selfie?.[0];

    const frontUrl = pickFileUrl(frontFile);
    const backUrl = pickFileUrl(backFile);
    const selfieUrl = pickFileUrl(selfieFile);

    // Build list of URLs to store in id_verification.document_images
    const newDocUrls = [frontUrl, backUrl, selfieUrl].filter(Boolean);

    if (newDocUrls.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Files were received but no valid URLs were produced.',
      });
    }

    // Upsert a single KYC record per user and append new images
    const kyc = await KYC.findOneAndUpdate(
      { user: userId },
      {
        $setOnInsert: {
          user: userId,
          status: 'in_progress',
          level: 'basic',
        },

        // If they haven’t submitted/verified yet, keep them in_progress
        $set: {
          status: { $in: ['$status', ['verified', 'pending_review']] } ? '$status' : 'in_progress',
        },

        $addToSet: {
          'id_verification.document_images': { $each: newDocUrls },
        },

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

    /**
     * NOTE:
     * Mongo doesn't allow that "$set: { status: { $in: ... } }" expression in findOneAndUpdate like that
     * unless using aggregation pipeline updates (Mongo 4.2+).
     * So we’ll do a safe follow-up instead:
     */
    let updated = kyc;
    if (kyc && !['verified', 'pending_review'].includes(kyc.status)) {
      updated = await KYC.findByIdAndUpdate(
        kyc._id,
        { $set: { status: 'in_progress' } },
        { new: true }
      );
    }

    // Optional: keep User.kyc in sync for dashboard display
    await User.findByIdAndUpdate(userId, {
      $set: { 'kyc.status': updated.status, 'kyc.level': updated.level },
    });

    return res.status(201).json({
      status: 'success',
      message: 'KYC documents uploaded successfully',
      data: {
        status: updated.status,
        level: updated.level,
        document_images: updated.id_verification?.document_images || [],
        submitted_at: updated.submitted_at || null,
        verified_at: updated.verified_at || null,
      },
    });
  } catch (error) {
    console.error('🔥 KYC UPLOAD ERROR:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// Get KYC status for logged-in user
const getKycStatus = async (req, res) => {
  try {
    const kycRecord = await KYC.findOne({ user: req.user.id });

    if (!kycRecord) {
      return res.json({ status: 'not_started' });
    }

    return res.json({ status: kycRecord.status });
  } catch (error) {
    console.error('KYC status fetch error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch KYC status' });
  }
};

/* =========================
   GET /api/kyc/requirements/:amount
========================= */
exports.getKycRequirements = async (req, res) => {
  const amount = Number(req.params.amount || 0);

  if (!Number.isFinite(amount) || amount < 0) {
    return res.status(400).json({ msg: 'Invalid amount' });
  }

  // Same thresholds you used before
  if (amount > 5000) {
    return res.json({
      required: true,
      level: 'enhanced',
      message: 'Enhanced KYC required',
    });
  }

  if (amount > 1000) {
    return res.json({
      required: true,
      level: 'basic',
      message: 'Basic KYC required',
    });
  }

  return res.json({
    required: false,
    level: 'none',
    message: 'No KYC required',
  });
};

/* =========================
   POST /api/kyc/start
   body: { level?: "basic" | "enhanced" }
========================= */
exports.startKyc = async (req, res) => {
  try {
    const userId = req.user?.id;
    const level = (req.body?.level || 'basic').toLowerCase();

    const kyc = await KYC.findOneAndUpdate(
      { user: userId },
      {
        $set: {
          user: userId,
          level,
          status: 'in_progress',
          started_at: new Date(),
        },
      },
      { upsert: true, new: true }
    );

    // Sync to User model too (so dashboard reads it)
    await User.findByIdAndUpdate(userId, {
      $set: {
        'kyc.status': 'in_progress',
        'kyc.level': level,
      },
    });

    return res.json({
      status: kyc.status,
      level: kyc.level,
      started_at: kyc.started_at || null,
    });
  } catch (err) {
    console.error('startKyc error:', err);
    return res.status(500).json({ msg: 'Server error' });
  }
};

/* =========================
   POST /api/kyc/submit
========================= */
exports.submitKyc = async (req, res) => {
  try {
    const userId = req.user?.id;

    const kyc = await KYC.findOne({ user: userId });
    if (!kyc) {
      return res.status(400).json({
        msg: 'No KYC record found. Please start KYC and upload documents first.',
      });
    }

    if (kyc.status === 'verified') {
      return res.status(400).json({ msg: 'KYC already verified' });
    }

    // ✅ Document checks based on your schema
    const idImagesCount = Array.isArray(kyc.id_verification?.document_images)
      ? kyc.id_verification.document_images.length
      : 0;

    const hasIdDocs = idImagesCount > 0;
    const hasProofOfAddress = Boolean(kyc.address_verification?.proof_document);

    // Enhanced KYC may require income proof (optional rule; you can enforce if you want)
    const requiresIncomeProof = kyc.level === 'enhanced';
    const hasIncomeProof = Boolean(kyc.financial_info?.income_proof);

    // Minimum requirement for submit: at least ID doc uploaded
    if (!hasIdDocs) {
      return res.status(400).json({
        msg: 'Please upload your ID document images before submitting.',
      });
    }

    // If you want to require proof of address for basic/enhanced, enforce here:
    // (Common flow: basic requires ID + selfie, enhanced requires ID + address + income)
    // Your schema stores proof_of_address as proof_document.
    // Enforce it if you want a stricter KYC:
    if (kyc.level !== 'none' && !hasProofOfAddress) {
      return res.status(400).json({
        msg: 'Please upload proof of address before submitting.',
      });
    }

    if (requiresIncomeProof && !hasIncomeProof) {
      return res.status(400).json({
        msg: 'Enhanced KYC requires proof of income. Please upload income proof before submitting.',
      });
    }

    kyc.status = 'pending_review';
    kyc.submitted_at = new Date();

    kyc.history.push({
      action: 'SUBMIT_KYC',
      status: 'pending_review',
      level: kyc.level,
      performed_by: userId,
      notes: 'User submitted KYC for review',
    });

    await kyc.save();

    // Optional sync to User model
    await User.findByIdAndUpdate(userId, {
      $set: { 'kyc.status': 'pending_review', 'kyc.level': kyc.level },
    });

    return res.json({
      msg: 'KYC submitted for review.',
      status: kyc.status,
      level: kyc.level,
      submitted_at: kyc.submitted_at,
    });
  } catch (err) {
    console.error('submitKyc error:', err);
    return res.status(500).json({ msg: 'Server error' });
  }
};



module.exports = { uploadKycDocuments, getKycStatus };