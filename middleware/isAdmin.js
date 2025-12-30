module.exports = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ msg: 'Unauthorized' });
  }

  if (
    req.user.user_type !== 'admin' &&
    req.user.role !== 'admin' &&
    req.user.isAdmin !== true
  ) {
    return res.status(403).json({ msg: 'Access denied. Admin privileges required.' });
  }

  next();
};