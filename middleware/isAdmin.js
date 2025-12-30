// backend/middleware/isAdmin.js
const User = require('../models/User');

module.exports = async function isAdmin(req, res, next) {
  try {
    // your auth middleware sets req.user = decoded token
    const userId = req.user?.id || req.user?._id || req.user?.userId;
    if (!userId) {
      return res.status(401).json({ msg: 'Unauthorized (no user in token)' });
    }

    const user = await User.findById(userId).select('user_type email');
    if (!user) return res.status(401).json({ msg: 'Unauthorized (user not found)' });

    if (user.user_type !== 'admin') {
      return res.status(403).json({ msg: 'Access denied. Admin only.' });
    }

    // optional: attach full user for later use
    req.adminUser = user;

    next();
  } catch (err) {
    console.error('isAdmin error:', err);
    return res.status(500).json({ msg: 'Server error' });
  }
};