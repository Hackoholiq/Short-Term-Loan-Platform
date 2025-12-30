// controllers/passwordController.js
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/User');
const PasswordResetToken = require('../models/PasswordResetToken');
const { generateResetToken } = require('../services/tokenService');
const { sendPasswordResetEmail } = require('../services/emailService');

// OPTIONAL (recommended) – if you have audit util already, enable this:
// const { audit } = require('../utils/audit');

/* =========================
   HELPERS
========================= */
const normalizeEmail = (email) => String(email || '').toLowerCase().trim();

const hashToken = (rawToken) =>
  crypto.createHash('sha256').update(String(rawToken)).digest('hex');

/* =========================
   POST /api/auth/forgot-password
   body: { email }
========================= */
exports.forgotPassword = async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);

    // Always respond the same to avoid account enumeration
    const genericMsg = 'If the email exists, a reset link has been sent.';

    if (!email) {
      return res.status(200).json({ msg: genericMsg });
    }

    const user = await User.findOne({ email });

    if (!user) {
      // Optional audit
      // await audit(req, { action: 'AUTH_FORGOT_PASSWORD', status: 'success', metadata: { email, exists: false } });
      return res.status(200).json({ msg: genericMsg });
    }

    // Optional: prevent resets for suspended/closed accounts
    if (user.account_status && ['suspended', 'closed'].includes(user.account_status)) {
      // Still don't reveal state; just return generic
      // await audit(req, { action: 'AUTH_FORGOT_PASSWORD', status: 'fail', reason: 'Account not eligible', metadata: { userId: user._id } });
      return res.status(200).json({ msg: genericMsg });
    }

    // Invalidate any existing unused tokens for this user (prevents multiple valid links)
    await PasswordResetToken.updateMany(
      { user_id: user._id, used_at: null },
      { $set: { used_at: new Date() } }
    );

    const { rawToken, hash } = generateResetToken();

    await PasswordResetToken.create({
      user_id: user._id,
      token_hash: hash, // should already be sha256 from tokenService
      expires_at: new Date(Date.now() + 30 * 60 * 1000), // 30 mins
      used_at: null,
    });

    const frontend = process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetLink = `${frontend}/reset-password?token=${encodeURIComponent(rawToken)}`;

    await sendPasswordResetEmail(user, resetLink);

    // Optional audit
    // await audit(req, { action: 'AUTH_FORGOT_PASSWORD', status: 'success', target_type: 'User', target_id: user._id, target_label: user.email });

    return res.status(200).json({ msg: genericMsg });
  } catch (err) {
    console.error('forgotPassword error:', err);

    // Do not leak internal errors; keep same generic message
    return res.status(200).json({ msg: 'If the email exists, a reset link has been sent.' });
  }
};

/* =========================
   POST /api/auth/reset-password
   body: { token, newPassword }
========================= */
exports.resetPassword = async (req, res) => {
  try {
    const token = String(req.body?.token || '').trim();
    const newPassword = String(req.body?.newPassword || '');

    if (!token) {
      return res.status(400).json({ msg: 'Token required' });
    }

    // Your route validator enforces min length,
    // but we enforce again here for safety.
    if (newPassword.length < 8) {
      return res.status(400).json({ msg: 'Password must be at least 8 characters' });
    }

    const tokenHash = hashToken(token);

    const resetRecord = await PasswordResetToken.findOne({
      token_hash: tokenHash,
      used_at: null,
      expires_at: { $gt: new Date() },
    });

    if (!resetRecord) {
      // Optional audit
      // await audit(req, { action: 'AUTH_RESET_PASSWORD', status: 'fail', reason: 'Invalid/expired token' });
      return res.status(400).json({ msg: 'Invalid or expired reset token' });
    }

    const user = await User.findById(resetRecord.user_id);
    if (!user) {
      // burn token anyway
      resetRecord.used_at = new Date();
      await resetRecord.save();

      // Optional audit
      // await audit(req, { action: 'AUTH_RESET_PASSWORD', status: 'fail', reason: 'User not found' });
      return res.status(400).json({ msg: 'Invalid reset token' });
    }

    // Optional: prevent resets for suspended/closed accounts
    if (user.account_status && ['suspended', 'closed'].includes(user.account_status)) {
      resetRecord.used_at = new Date();
      await resetRecord.save();
      return res.status(403).json({ msg: 'Account is not eligible for password reset' });
    }

    const salt = await bcrypt.genSalt(10);
    user.password_hash = await bcrypt.hash(newPassword, salt);
    await user.save();

    // Mark token used
    resetRecord.used_at = new Date();
    await resetRecord.save();

    // Optional: invalidate any other outstanding tokens for this user
    await PasswordResetToken.updateMany(
      { user_id: user._id, used_at: null },
      { $set: { used_at: new Date() } }
    );

    // Optional audit
    // await audit(req, { action: 'AUTH_RESET_PASSWORD', status: 'success', target_type: 'User', target_id: user._id, target_label: user.email });

    return res.json({ msg: 'Password reset successful. You can now log in.' });
  } catch (err) {
    console.error('resetPassword error:', err);
    return res.status(500).json({ msg: 'Server error' });
  }
};