// backend/middleware/isAdmin.js
const User = require('../models/User');

module.exports = async (req, res, next) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ msg: 'Unauthorized' });
    }

    const user = await User.findById(req.user.id).select('user_type');
    if (!user) return res.status(401).json({ msg: 'Unauthorized' });

    if (user.user_type !== 'admin') {
      return res.status(403).json({ msg: 'Access denied. Admin only.' });
    }

    // Optional: attach fresh role to request
    req.user.user_type = user.user_type;

    next();
  } catch (err) {
    console.error('isAdmin error:', err);
    return res.status(500).json({ msg: 'Server error' });
  }
};