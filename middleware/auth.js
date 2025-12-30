const jwt = require('jsonwebtoken');
require('dotenv').config();

module.exports = function (req, res, next) {
  let token = req.header('Authorization') || req.header('x-auth-token');

  if (!token) {
    return res.status(401).json({ msg: 'No token, authorization denied' });
  }

  // Remove "Bearer " prefix if present
  if (typeof token === 'string' && token.startsWith('Bearer ')) {
    token = token.slice(7);
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // ✅ FIX: attach the decoded payload directly
    // (your token payload is { id, user_type, iat, exp }, not { user: {...} })
    req.user = decoded;

    next();
  } catch (err) {
    console.error('Token verification error:', err.message);

    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ msg: 'Token has expired' });
    }

    return res.status(401).json({ msg: 'Token is not valid' });
  }
};