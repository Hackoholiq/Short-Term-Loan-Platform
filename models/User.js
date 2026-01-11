const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema(
  {
    // Basic Information
    first_name: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
      maxlength: [50, 'First name cannot exceed 50 characters'],
    },
    last_name: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
      maxlength: [50, 'Last name cannot exceed 50 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address'],
    },

    // Password Reset (✅ deduped)
    reset_password_token_hash: { type: String, default: null },
    reset_password_expires_at: { type: Date, default: null },
    reset_password_used_at: { type: Date, default: null },

    // Authentication
    password_hash: {
      type: String,
      required: [true, 'Password hash is required'],
    },

    // Contact Information
    address: { type: String, trim: true },
    phone: {
      type: String,
      trim: true,
      match: [/^[\+]?[1-9][\d]{0,15}$/, 'Please enter a valid phone number'],
    },
    date_of_birth: {
      type: Date,
      validate: {
        validator: function (dob) {
          const minAge = new Date();
          minAge.setFullYear(minAge.getFullYear() - 18);
          return dob <= minAge;
        },
        message: 'User must be at least 18 years old',
      },
    },

    // Financial Information
    creditScore: {
      type: Number,
      default: 0,
      min: [0, 'Credit score cannot be negative'],
      max: [850, 'Credit score cannot exceed 850'],
    },

    // User Type & Permissions
    user_type: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    account_status: {
      type: String,
      enum: ['active', 'suspended', 'closed', 'under_review'],
      default: 'active',
    },

    // KYC Status & Data
    kyc: {
      status: {
        type: String,
        enum: ['not_started', 'in_progress', 'pending_review', 'verified', 'rejected', 'expired'],
        default: 'not_started',
      },
      level: {
        type: String,
        enum: ['none', 'basic', 'enhanced'],
        default: 'none',
      },

      documents: {
        document_type: {
          type: String,
          enum: ['passport', 'drivers_license', 'national_id', 'residence_permit', null],
          default: null,
        },
        document_number: { type: String, trim: true },

        document_front_url: String,
        document_back_url: String,
        selfie_with_document_url: String,
        proof_of_address_url: String,

        document_issue_date: Date,
        document_expiry_date: Date,
        document_country: String,
        document_verified_at: Date,
      },

      verification_attempts: { type: Number, default: 0, min: 0 },
      last_verification_attempt: Date,

      verified_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      verified_at: Date,

      rejection_reason: String,
      rejection_details: [
        {
          field: String,
          issue: String,
          timestamp: { type: Date, default: Date.now },
        },
      ],

      api_verification_id: String,
      api_verification_data: mongoose.Schema.Types.Mixed,
      api_confidence_score: Number,

      face_match_score: { type: Number, min: 0, max: 100 },
      liveness_detection_passed: Boolean,
    },

    // Risk Assessment
    risk_level: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    risk_score: { type: Number, default: 50, min: 0, max: 100 },
    risk_factors: [
      {
        factor: String,
        weight: Number,
        detected_at: { type: Date, default: Date.now },
      },
    ],

    // Compliance & Audit
    pep_status: {
      type: String,
      enum: ['not_checked', 'pep', 'family_member_of_pep', 'not_pep'],
      default: 'not_checked',
    },
    sanction_check_status: {
      type: String,
      enum: ['not_checked', 'clear', 'match_found'],
      default: 'not_checked',
    },

    // Activity Tracking
    last_kyc_review: Date,
    next_kyc_review_due: {
      type: Date,
      default: function () {
        const oneYearLater = new Date();
        oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
        return oneYearLater;
      },
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        delete ret.password_hash;
        if (ret.kyc) delete ret.kyc.api_verification_data;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

// Virtuals
UserSchema.virtual('full_name').get(function () {
  return `${this.first_name} ${this.last_name}`;
});

UserSchema.virtual('age').get(function () {
  if (!this.date_of_birth) return null;
  const today = new Date();
  const birthDate = new Date(this.date_of_birth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;
  return age;
});

UserSchema.virtual('kyc_is_expired').get(function () {
  if (!this.kyc?.verified_at || !this.next_kyc_review_due) return false;
  return new Date() > this.next_kyc_review_due;
});

UserSchema.virtual('kyc_days_since_verification').get(function () {
  if (!this.kyc?.verified_at) return null;
  const diffTime = Math.abs(new Date() - this.kyc.verified_at);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Indexes
UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ 'kyc.status': 1 });
UserSchema.index({ 'kyc.verified_at': 1 });
UserSchema.index({ next_kyc_review_due: 1 });
UserSchema.index({ risk_score: -1 });

module.exports = mongoose.model('User', UserSchema);