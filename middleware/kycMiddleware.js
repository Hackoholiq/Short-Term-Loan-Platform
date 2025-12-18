// middleware/kycMiddleware.js - NEW FILE
const User = require('../models/User');

// Middleware to check if KYC is verified for loan routes
const requireKYC = (requiredLevel = 'basic') => {
  return async (req, res, next) => {
    try {
      const user = await User.findById(req.user.id);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      const levelHierarchy = { 'none': 0, 'basic': 1, 'enhanced': 2 };
      const userLevel = user.kyc.level || 'none';
      
      // Check if KYC is verified and meets required level
      if (user.kyc.status !== 'verified' || 
          levelHierarchy[userLevel] < levelHierarchy[requiredLevel]) {
        
        return res.status(403).json({
          error: 'KYC_VERIFICATION_REQUIRED',
          message: `KYC verification (${requiredLevel} level) required`,
          currentStatus: user.kyc.status,
          currentLevel: user.kyc.level,
          requiredLevel: requiredLevel
        });
      }
      
      next();
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };
};

module.exports = { requireKYC };