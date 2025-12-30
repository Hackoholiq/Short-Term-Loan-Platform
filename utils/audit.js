const AuditLog = require('../models/AuditLog');

function getClientIp(req) {
  // trust proxy already enabled in your server.js, so x-forwarded-for is usable
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length) return xff.split(',')[0].trim();
  return req.ip;
}

async function audit(req, {
  action,
  target_type,
  target_id,
  target_label,
  status = 'success',
  reason,
  metadata = {},
}) {
  try {
    await AuditLog.create({
      actor_user_id: req.user?.id || req.user?._id, // supports either shape
      actor_email: req.user?.email,
      actor_role: req.user?.user_type,

      action,
      target_type,
      target_id,
      target_label,

      status,
      reason,

      metadata,

      ip: getClientIp(req),
      user_agent: req.headers['user-agent'],
    });
  } catch (e) {
    // Never break the API because logging failed
    console.error('Audit log failed:', e.message);
  }
}

module.exports = { audit };