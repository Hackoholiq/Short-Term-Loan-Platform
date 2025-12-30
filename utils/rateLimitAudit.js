const { audit } = require('./audit');

const safeEmailFromBody = (req) => {
  try {
    const email = req.body?.email;
    if (!email) return undefined;
    return String(email).toLowerCase().trim();
  } catch {
    return undefined;
  }
};

const auditRateLimit = async (req, { action, reason, metadata = {} }) => {
  await audit(req, {
    action,
    target_type: 'RateLimit',
    status: 'fail',
    reason,
    metadata: {
      path: req.originalUrl,
      method: req.method,
      ip_forwarded_for: req.headers['x-forwarded-for'],
      user_agent: req.headers['user-agent'],
      attempted_email: safeEmailFromBody(req),
      ...metadata,
    },
  });
};

module.exports = { auditRateLimit };