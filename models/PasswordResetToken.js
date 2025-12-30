const mongoose = require('mongoose');

const PasswordResetTokenSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  token_hash: {
    type: String,
    required: true,
  },
  expires_at: {
    type: Date,
    required: true,
  },
  used_at: {
    type: Date,
    default: null,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('PasswordResetToken', PasswordResetTokenSchema);