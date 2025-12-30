const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  // Basic Information
  first_name: { 
    type: String, 
    required: [true, 'First name is required'],
    trim: true,
    maxlength: [50, 'First name cannot exceed 50 characters']
  },
  last_name: { 
    type: String, 
    required: [true, 'Last name is required'],
    trim: true,
    maxlength: [50, 'Last name cannot exceed 50 characters']
  },
  email: { 
    type: String, 
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address']
  },

  // Passweord Reset
  reset_password_token_hash: { type: String },
  reset_password_expires_at: { type: Date },
  reset_password_used_at: { type: Date },

  reset_password_token_hash: { type: String, default: null },
  reset_password_expires_at: { type: Date, default: null },
  
  // Authentication
  password_hash: { 
    type: String, 
    required: [true, 'Password hash is required']
  },
  
  // Contact Information
  address: { 
    type: String,
    trim: true
  },
  phone: { 
    type: String,
    trim: true,
    match: [/^[\+]?[1-9][\d]{0,15}$/, 'Please enter a valid phone number']
  },
  date_of_birth: { 
    type: Date,
    validate: {
      validator: function(dob) {
        // Must be at least 18 years old
        const minAge = new Date();
        minAge.setFullYear(minAge.getFullYear() - 18);
        return dob <= minAge;
      },
      message: 'User must be at least 18 years old'
    }
  },
  
  // Financial Information
  creditScore: { 
    type: Number, 
    default: 0,
    min: [0, 'Credit score cannot be negative'],
    max: [850, 'Credit score cannot exceed 850']
  },
  
  // User Type & Permissions
  user_type: { 
    type: String, 
    enum: ['user', 'admin'], 
    default: 'user' 
  },
  account_status: {
    type: String,
    enum: ['active', 'suspended', 'closed', 'under_review'],
    default: 'active'
  },
  
  // KYC Status & Data - CORE ADDITION
  kyc: {
    status: {
      type: String,
      enum: ['not_started', 'in_progress', 'pending_review', 'verified', 'rejected', 'expired'],
      default: 'not_started'
    },
    level: {
      type: String,
      enum: ['none', 'basic', 'enhanced'],
      default: 'none'
    },
    // Document Information
    documents: {
      document_type: {
        type: String,
        enum: ['passport', 'drivers_license', 'national_id', 'residence_permit', null],
        default: null
      },
      document_number: {
        type: String,
        trim: true,
        sparse: true // Allows null/undefined without unique constraint
      },
      // File URLs - Store in secure cloud storage (S3, Cloudinary, etc.)
      document_front_url: String,
      document_back_url: String,
      selfie_with_document_url: String,
      proof_of_address_url: String, // Utility bill, bank statement
      
      // Document metadata
      document_issue_date: Date,
      document_expiry_date: Date,
      document_country: String,
      document_verified_at: Date
    },
    
    // Verification Details
    verification_attempts: {
      type: Number,
      default: 0,
      min: 0
    },
    last_verification_attempt: Date,
    
    // Verification Results
    verified_by: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User' // Admin who verified
    },
    verified_at: Date,
    
    // Rejection Information (if applicable)
    rejection_reason: String,
    rejection_details: [{
      field: String,
      issue: String,
      timestamp: { type: Date, default: Date.now }
    }],
    
    // Automated Verification Results (if using API)
    api_verification_id: String, // Reference ID from KYC provider
    api_verification_data: mongoose.Schema.Types.Mixed, // Raw response from KYC provider
    api_confidence_score: Number, // 0-100 confidence score from provider
    
    // Face Match Score (if doing facial recognition)
    face_match_score: {
      type: Number,
      min: 0,
      max: 100
    },
    liveness_detection_passed: Boolean
  },
  
  // Risk Assessment
  risk_level: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  },
  risk_score: {
    type: Number,
    default: 50,
    min: 0,
    max: 100
  },
  risk_factors: [{
    factor: String,
    weight: Number,
    detected_at: { type: Date, default: Date.now }
  }],
  
  // Compliance & Audit
  pep_status: { // Politically Exposed Person
    type: String,
    enum: ['not_checked', 'pep', 'family_member_of_pep', 'not_pep'],
    default: 'not_checked'
  },
  sanction_check_status: {
    type: String,
    enum: ['not_checked', 'clear', 'match_found'],
    default: 'not_checked'
  },
  
  // Activity Tracking
  last_kyc_review: Date,
  next_kyc_review_due: {
    type: Date,
    default: function() {
      // Default to 1 year from verification
      const oneYearLater = new Date();
      oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
      return oneYearLater;
    }
  },
  
  // Metadata
  created_at: { 
    type: Date, 
    default: Date.now 
  },
  updated_at: { 
    type: Date, 
    default: Date.now 
  }
}, {
  timestamps: { 
    createdAt: 'created_at', 
    updatedAt: 'updated_at' 
  },
  toJSON: { 
    virtuals: true,
    transform: function(doc, ret) {
      // Remove sensitive fields when converting to JSON
    delete ret.password_hash;
    if (ret.kyc) {
      delete ret.kyc.api_verification_data;
    }

    return ret;
  }
},
  toObject: { virtuals: true }
});

// Virtual for full name
UserSchema.virtual('full_name').get(function() {
  return `${this.first_name} ${this.last_name}`;
});

// Virtual for age
UserSchema.virtual('age').get(function() {
  if (!this.date_of_birth) return null;
  const today = new Date();
  const birthDate = new Date(this.date_of_birth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
});

// Virtual for KYC expiry status
UserSchema.virtual('kyc.is_expired').get(function() {
  if (!this.kyc.verified_at || !this.next_kyc_review_due) return false;
  return new Date() > this.next_kyc_review_due;
});

// Virtual for KYC verification age (in days)
UserSchema.virtual('kyc.days_since_verification').get(function() {
  if (!this.kyc.verified_at) return null;
  const diffTime = Math.abs(new Date() - this.kyc.verified_at);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Pre-save middleware to update timestamps
UserSchema.pre('save', function(next) {
  this.updated_at = new Date();
  next();
});

// Method to check if KYC is required for loan amount
UserSchema.methods.isKYCRequiredForLoan = function(loanAmount) {
  // Example logic: KYC required for loans > $1000 or if never verified
  const kycThreshold = 1000;
  
  if (loanAmount > kycThreshold && this.kyc.status !== 'verified') {
    return true;
  }
  
  // Enhanced due diligence for larger amounts
  if (loanAmount > 5000 && this.kyc.level !== 'enhanced') {
    return true;
  }
  
  return false;
};

// Method to start KYC process
UserSchema.methods.startKYCProcess = function(level = 'basic') {
  this.kyc.status = 'in_progress';
  this.kyc.level = level;
  this.kyc.verification_attempts += 1;
  this.kyc.last_verification_attempt = new Date();
  return this.save();
};

// Method to submit KYC documents
UserSchema.methods.submitKYCDocuments = function(documentData) {
  this.kyc.documents = {
    ...this.kyc.documents,
    ...documentData,
    document_verified_at: new Date()
  };
  this.kyc.status = 'pending_review';
  return this.save();
};

// Static method to find users pending KYC review
UserSchema.statics.findPendingKYC = function() {
  return this.find({ 'kyc.status': 'pending_review' })
    .sort({ 'kyc.last_verification_attempt': 1 })
    .select('first_name last_name email phone kyc.documents created_at');
};

// Static method to find users with expiring KYC
UserSchema.statics.findExpiringKYC = function(daysThreshold = 30) {
  const thresholdDate = new Date();
  thresholdDate.setDate(thresholdDate.getDate() + daysThreshold);
  
  return this.find({
    'kyc.status': 'verified',
    'next_kyc_review_due': { $lte: thresholdDate }
  }).select('first_name last_name email kyc.verified_at next_kyc_review_due');
};

// Indexes for performance
UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ 'kyc.status': 1 });
UserSchema.index({ 'kyc.verified_at': 1 });
UserSchema.index({ 'next_kyc_review_due': 1 });
UserSchema.index({ risk_score: -1 });
UserSchema.index({ created_at: -1 });

module.exports = mongoose.model('User', UserSchema);