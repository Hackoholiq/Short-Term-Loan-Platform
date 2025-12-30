const AuditLog = require('../models/AuditLog');

function getClientIp(req) {
  // trust proxy enabled => x-forwarded-for is reliable on Render
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length) return xff.split(',')[0].trim();
  return req.ip;
}

function getActorId(req) {
  return req.user?.id || req.user?._id || req.user?.user?.id || req.user?.user?._id || null;
}

function getActorEmail(req) {
  return req.user?.email || req.user?.user?.email || null;
}

function getActorRole(req) {
  return req.user?.user_type || req.user?.user?.user_type || null;
}

/**
 * audit(req, { action, target_type, target_id, target_label, status, reason, metadata })
 *
 * - Works for both authenticated and unauthenticated requests
 * - Never throws (won't break API flows)
 */
async function audit(
  req,
  {
    action,
    target_type,
    target_id,
    target_label,
    status = 'success',
    reason,
    metadata = {},
  }
) {
  try {
    const actorId = getActorId(req);

    await AuditLog.create({
      actor_user_id: actorId || undefined, // optional in schema
      actor_is_authenticated: Boolean(actorId),
      actor_email: getActorEmail(req) || undefined,
      actor_role: getActorRole(req) || undefined,

      action,
      target_type,
      target_id: target_id || undefined,
      target_label: target_label || undefined,

      status,
      reason: reason || undefined,

      metadata,

      ip: getClientIp(req),
      user_agent: req.headers['user-agent'],
      // created_at handled by schema default
    });
  } catch (e) {
    // Never break the API because logging failed
    console.error('Audit log failed:', e.message);
  }
}

module.exports = { audit };