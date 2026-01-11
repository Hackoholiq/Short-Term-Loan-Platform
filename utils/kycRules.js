// utils/kycRules.js
function getKycRequirementForAmount(amount) {
  const amt = Number(amount) || 0;

  if (amt > 5000) {
    return { required: true, level: 'enhanced', message: 'Enhanced KYC required' };
  }
  if (amt > 1000) {
    return { required: true, level: 'basic', message: 'Basic KYC required' };
  }
  return { required: false, level: 'none', message: 'No KYC required' };
}

const levelRank = { none: 0, basic: 1, enhanced: 2 };
function meetsKyc(requiredLevel, userLevel) {
  return (levelRank[userLevel || 'none'] || 0) >= (levelRank[requiredLevel || 'none'] || 0);
}

module.exports = { getKycRequirementForAmount, meetsKyc, levelRank };