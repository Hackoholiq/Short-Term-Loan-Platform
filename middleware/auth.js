// backend/middleware/auth.js
const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  let token = req.header('Authorization') || req.header('x-auth-token');

  if (!token) return res.status(401).json({ msg: 'No token, authorization denied' });

  if (token.startsWith('Bearer ')) token = token.slice(7);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // decoded should be: { id, user_type, iat, exp }
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return res.status(401).json({ msg: 'Token has expired' });
    return res.status(401).json({ msg: 'Token is not valid' });
  }
};