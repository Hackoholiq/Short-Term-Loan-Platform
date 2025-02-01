module.exports = (req, res, next) => {
    if (req.user.user_type !== 'admin') {
      return res.status(403).json({ msg: 'Access denied. Admin only.' });
    }
    next();
  };