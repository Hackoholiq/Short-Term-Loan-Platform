const User = require('../models/User');

module.exports = async (req, res, next) => {
  try {
    // req.user comes from auth middleware (decoded token)
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ msg: 'Not authorized' });
    }

    const user = await User.findById(userId).select('user_type');
    if (!user) {
      return res.status(401).json({ msg: 'User not found' });
    }

    if (user.user_type !== 'admin') {
      return res.status(403).json({ msg: 'Access denied. Admin only.' });
    }

    next();
  } catch (err) {
    console.error('isAdmin middleware error:', err);
    return res.status(500).json({ msg: 'Server error' });
  }
};