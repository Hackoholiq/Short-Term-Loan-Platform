const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema(
  {
    actor_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    actor_email: { type: String, trim: true },
    actor_role: { type: String, trim: true }, // e.g. "admin"

    action: {
      type: String,
      required: true,
      trim: true,
      index: true,
      // examples: "ADMIN_PROMOTE_USER", "ADMIN_APPROVE_LOAN"
    },

    target_type: { type: String, trim: true, index: true }, // "User" | "Loan"
    target_id: { type: mongoose.Schema.Types.ObjectId, index: true },

    // snapshot to help investigations later (safe subset only)
    target_label: { type: String, trim: true }, // e.g. target email or loan short id

    status: {
      type: String,
      enum: ['success', 'fail'],
      default: 'success',
      index: true,
    },

    reason: { type: String, trim: true }, // error message / validation fail reason

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    ip: { type: String, trim: true },
    user_agent: { type: String, trim: true },

    created_at: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false }
);

module.exports = mongoose.model('AuditLog', AuditLogSchema);