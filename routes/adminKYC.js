// backend/routes/adminKYC.js
const express = require('express');
const router = express.Router();

const auth = require('../middleware/auth');
const isAdmin = require('../middleware/isAdmin');

const KYC = require('../models/KYC');
const User = require('../models/User');

// Valid KYC statuses and levels
const KYC_STATUSES = ['not_started', 'in_progress', 'pending_review', 'verified', 'rejected', 'expired'];
const KYC_LEVELS = ['none', 'basic', 'enhanced'];

// Helpers
const parseIntSafe = (v, fallback) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const escapeRegex = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* =========================
   GET /api/admin/kyc/pending
   Pending KYC applications (paginated)
========================= */
router.get('/kyc/pending', auth, isAdmin, async (req, res) => {
  try {
    const page = parseIntSafe(req.query.page, 1);
    const limit = parseIntSafe(req.query.limit, 20);
    const skip = (page - 1) * limit;

    const query = { status: 'pending_review' };

    const [kycs, total] = await Promise.all([
      KYC.find(query)
        .populate('user', 'first_name last_name email phone created_at')
        .populate('reviewed_by', 'first_name last_name email')
        .sort({ submitted_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      KYC.countDocuments(query),
    ]);

    return res.json({
      success: true,
      kycs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching pending KYC:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch pending KYC applications',
    });
  }
});

/* =========================
   GET /api/admin/kyc/applications
   All applications (filters + search + pagination)
========================= */
router.get('/kyc/applications', auth, isAdmin, async (req, res) => {
  try {
    const { status, level, search } = req.query;

    const page = parseIntSafe(req.query.page, 1);
    const limit = parseIntSafe(req.query.limit, 20);
    const skip = (page - 1) * limit;

    const query = {};

    if (status && KYC_STATUSES.includes(status)) query.status = status;
    if (level && KYC_LEVELS.includes(level)) query.level = level;

    // Search users by first_name/last_name/email (no "name" field exists in your User model)
    if (search && String(search).trim()) {
      const s = String(search).trim();
      const rx = new RegExp(escapeRegex(s), 'i');

      const users = await User.find({
        $or: [
          { first_name: rx },
          { last_name: rx },
          { email: rx },
          // "full name" search: match "first last" by concatenation (basic approach)
          // This uses $expr and $concat which works on MongoDB; safe and effective.
          {
            $expr: {
              $regexMatch: {
                input: { $concat: ['$first_name', ' ', '$last_name'] },
                regex: s,
                options: 'i',
              },
            },
          },
        ],
      }).select('_id');

      query.user = { $in: users.map((u) => u._id) };
    }

    const [kycs, total] = await Promise.all([
      KYC.find(query)
        .populate('user', 'first_name last_name email phone created_at')
        .populate('reviewed_by', 'first_name last_name email')
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      KYC.countDocuments(query),
    ]);

    return res.json({
      success: true,
      kycs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching KYC applications:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch KYC applications',
    });
  }
});

/* =========================
   GET /api/admin/kyc/:id
   Single KYC application details
========================= */
router.get('/kyc/:id', auth, isAdmin, async (req, res) => {
  try {
    const kyc = await KYC.findById(req.params.id)
      .populate('user', 'first_name last_name email phone date_of_birth created_at')
      .populate('reviewed_by', 'first_name last_name email')
      .lean();

    if (!kyc) {
      return res.status(404).json({
        success: false,
        error: 'KYC application not found',
      });
    }

    return res.json({ success: true, kyc });
  } catch (error) {
    console.error('Error fetching KYC details:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch KYC details',
    });
  }
});


const cloudinary = require('../config/cloudinary');

function publicIdFromCloudinaryUrl(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);

    const uploadIdx = parts.findIndex((p) => p === 'upload');
    if (uploadIdx === -1) return null;

    const tail = parts.slice(uploadIdx + 1);

    // Skip transformations until version v123...
    let i = 0;
    while (i < tail.length && !/^v\d+$/.test(tail[i])) i++;
    if (i < tail.length && /^v\d+$/.test(tail[i])) i++;

    const publicPath = tail.slice(i).join('/');
    if (!publicPath) return null;

    return publicPath.replace(/\.[^/.]+$/, ''); // remove extension
  } catch {
    return null;
  }
}

function makeSigned(public_id, { resource_type = 'image', type = 'authenticated', expiresAtSeconds = 600, transformation } = {}) {
  const expires_at = Math.floor(Date.now() / 1000) + expiresAtSeconds;

  return cloudinary.url(public_id, {
    resource_type,
    type,
    secure: true,
    sign_url: true,
    expires_at,
    ...(transformation ? { transformation } : {}),
  });
}

// ✅ Admin-only: returns signed original + signed page-1 JPG preview (for PDFs)
router.get('/kyc/signed-url', auth, isAdmin, async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ success: false, error: 'Missing url query param' });

    const public_id = publicIdFromCloudinaryUrl(url);
    if (!public_id) return res.status(400).json({ success: false, error: 'Could not parse public_id from url' });

    // Your URLs show /image/upload/ so resource_type should be "image" for both jpg & pdf.
    const resource_type = 'image';

    // Try authenticated first; if it fails in practice, switch order or use private.
    const typesToTry = ['authenticated', 'private'];

    // We can’t “verify” the URL without making a request here, so we return both candidates.
    const signedCandidates = typesToTry.map((t) => ({
      type: t,
      signedUrl: makeSigned(public_id, { resource_type, type: t, expiresAtSeconds: 600 }),
      previewUrl: makeSigned(public_id, {
        resource_type,
        type: t,
        expiresAtSeconds: 600,
        transformation: [{ pg: 1, width: 1000, crop: 'limit', quality: 'auto', fetch_format: 'jpg' }],
      }),
    }));

    return res.json({
      success: true,
      public_id,
      resource_type,
      candidates: signedCandidates,
    });
  } catch (e) {
    console.error('signed-url error:', e);
    return res.status(500).json({ success: false, error: 'Failed to create signed url' });
  }
});

/* =========================
   POST /api/admin/kyc/:id/approve
   body: { level?, notes? }
========================= */
router.post('/kyc/:id/approve', auth, isAdmin, async (req, res) => {
  try {
    const { level, notes } = req.body || {};

    const kyc = await KYC.findById(req.params.id);
    if (!kyc) return res.status(404).json({ success: false, error: 'KYC not found' });

    // Stronger rules: approve only if it's pending_review
    if (kyc.status === 'verified') return res.status(400).json({ success: false, error: 'KYC already approved' });
    if (kyc.status === 'rejected') return res.status(400).json({ success: false, error: 'Cannot approve rejected KYC' });
    if (kyc.status !== 'pending_review') {
      return res.status(400).json({ success: false, error: `Cannot approve KYC in status '${kyc.status}'` });
    }

    // Validate level override (optional)
    let newLevel = kyc.level;
    if (level) {
      const lvl = String(level).toLowerCase();
      if (!KYC_LEVELS.includes(lvl) || lvl === 'none') {
        return res.status(400).json({ success: false, error: "Invalid level. Use 'basic' or 'enhanced'." });
      }
      newLevel = lvl;
    }

    const now = new Date();

    kyc.status = 'verified';
    kyc.level = newLevel;
    kyc.verified_at = now;
    kyc.reviewed_by = req.user.id;
    kyc.review_notes = notes || '';

    kyc.history.push({
      action: 'KYC_APPROVED',
      status: 'verified',
      level: newLevel,
      performed_by: req.user.id,
      timestamp: now,
      notes: `Approved by admin.${notes ? ` ${notes}` : ''}`,
    });

    await kyc.save();

    // Sync user.kyc
    await User.findByIdAndUpdate(kyc.user, {
      $set: {
        'kyc.status': 'verified',
        'kyc.level': newLevel,
        'kyc.verified_at': now,
        'kyc.rejection_reason': null,
        'kyc.last_verification_attempt': now,
      },
    });

    return res.json({
      success: true,
      message: 'KYC approved successfully',
      kyc: {
        id: kyc._id,
        status: kyc.status,
        level: kyc.level,
        user: kyc.user,
        verified_at: kyc.verified_at,
      },
    });
  } catch (error) {
    console.error('Error approving KYC:', error);
    return res.status(500).json({ success: false, error: 'Failed to approve KYC' });
  }
});

/* =========================
   POST /api/admin/kyc/:id/reject
   body: { reason, notes? }
========================= */
router.post('/kyc/:id/reject', auth, isAdmin, async (req, res) => {
  try {
    const { reason, notes } = req.body || {};
    if (!reason) return res.status(400).json({ success: false, error: 'Rejection reason is required' });

    const kyc = await KYC.findById(req.params.id);
    if (!kyc) return res.status(404).json({ success: false, error: 'KYC not found' });

    // Stronger rules: reject only if it's pending_review
    if (kyc.status === 'rejected') return res.status(400).json({ success: false, error: 'KYC already rejected' });
    if (kyc.status === 'verified') return res.status(400).json({ success: false, error: 'Cannot reject approved KYC' });
    if (kyc.status !== 'pending_review') {
      return res.status(400).json({ success: false, error: `Cannot reject KYC in status '${kyc.status}'` });
    }

    const now = new Date();

    kyc.status = 'rejected';
    kyc.rejection_reason = reason;
    kyc.reviewed_by = req.user.id;
    kyc.review_notes = notes || '';

    kyc.history.push({
      action: 'KYC_REJECTED',
      status: 'rejected',
      level: kyc.level,
      performed_by: req.user.id,
      timestamp: now,
      notes: `Rejected: ${reason}.${notes ? ` ${notes}` : ''}`,
    });

    await kyc.save();

    await User.findByIdAndUpdate(kyc.user, {
      $set: {
        'kyc.status': 'rejected',
        'kyc.rejection_reason': reason,
        'kyc.last_verification_attempt': now,
      },
    });

    return res.json({
      success: true,
      message: 'KYC rejected successfully',
      kyc: { id: kyc._id, status: kyc.status, rejection_reason: reason },
    });
  } catch (error) {
    console.error('Error rejecting KYC:', error);
    return res.status(500).json({ success: false, error: 'Failed to reject KYC' });
  }
});

/* =========================
   GET /api/admin/kyc/export
========================= */
router.get('/kyc/export', auth, isAdmin, async (req, res) => {
  try {
    const { format = 'csv', startDate, endDate } = req.query;
    const query = {};

    if (startDate || endDate) {
      query.submitted_at = {};
      if (startDate) query.submitted_at.$gte = new Date(startDate);
      if (endDate) query.submitted_at.$lte = new Date(endDate);
    }

    const kycs = await KYC.find(query)
      .populate('user', 'first_name last_name email phone')
      .populate('reviewed_by', 'first_name last_name email')
      .sort({ submitted_at: -1 })
      .lean();

    if (format === 'csv') {
      const csvData = kycs.map((kyc) => ({
        'KYC ID': kyc._id,
        'User Name': kyc.user ? `${kyc.user.first_name || ''} ${kyc.user.last_name || ''}`.trim() : 'N/A',
        'User Email': kyc.user?.email || 'N/A',
        'Status': kyc.status,
        'Level': kyc.level,
        'Submitted Date': kyc.submitted_at?.toISOString() || 'N/A',
        'Verified Date': kyc.verified_at?.toISOString() || 'N/A',
        'Reviewed By': kyc.reviewed_by
          ? `${kyc.reviewed_by.first_name || ''} ${kyc.reviewed_by.last_name || ''}`.trim()
          : 'N/A',
        'Rejection Reason': kyc.rejection_reason || 'N/A',
      }));

      const csvHeaders = Object.keys(csvData[0] || {}).join(',');
      const csvRows = csvData.map((row) =>
        Object.values(row)
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(',')
      );
      const csvContent = [csvHeaders, ...csvRows].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=kyc_export.csv');
      return res.send(csvContent);
    }

    return res.json({ success: true, kycs });
  } catch (error) {
    console.error('Error exporting KYC:', error);
    return res.status(500).json({ success: false, error: 'Failed to export KYC data' });
  }
});

module.exports = router;