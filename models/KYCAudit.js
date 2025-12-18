// models/KYCAudit.js
const mongoose = require('mongoose');

const KYCAuditSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  action: { 
    type: String, 
    required: true,
    enum: [
      'document_uploaded', 
      'verification_started',
      'verification_completed',
      'status_changed',
      'manual_review',
      'rejected',
      'api_called',
      'webhook_received'
    ]
  },
  details: mongoose.Schema.Types.Mixed,
  performed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  ip_address: String,
  user_agent: String,
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('KYCAudit', KYCAuditSchema);