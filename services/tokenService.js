const crypto = require('crypto');

const generateResetToken = () => {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(rawToken).digest('hex');

  return {
    rawToken,
    hash,
  };
};

module.exports = {
  generateResetToken,
};