const mongoose = require('mongoose');

const KYCSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
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
  // Personal Information
  personal_info: {
    full_name: String,
    date_of_birth: Date,
    gender: String,
    nationality: String,
    place_of_birth: String
  },
  // ID Verification
  id_verification: {
    document_type: {
      type: String,
      enum: ['passport', 'national_id', 'drivers_license', 'voters_card', 'other']
    },
    document_number: String,
    issue_date: Date,
    expiry_date: Date,
    issuing_country: String,
    document_images: [String], // Front, back, selfie
    verified: { type: Boolean, default: false },
    verification_date: Date,
    verification_method: String // auto, manual
  },
  // Address Verification
  address_verification: {
    current_address: {
      street: String,
      city: String,
      state: String,
      country: String,
      postal_code: String
    },
    proof_type: {
      type: String,
      enum: ['utility_bill', 'bank_statement', 'lease_agreement', 'tax_document', 'other']
    },
    proof_document: String,
    verified: { type: Boolean, default: false },
    verification_date: Date
  },
  // Enhanced KYC - Financial Information
  financial_info: {
    employment_status: String,
    occupation: String,
    employer_name: String,
    monthly_income: Number,
    income_source: String,
    income_proof: String, // Payslip, bank statement
    verified: { type: Boolean, default: false }
  },
  // Biometric/Liveness Check
  biometric_verification: {
    liveness_check: Boolean,
    facial_recognition_match: Boolean,
    confidence_score: Number,
    verification_date: Date
  },
  // Risk Assessment
  risk_assessment: {
    risk_score: Number,
    risk_level: { type: String, enum: ['low', 'medium', 'high'] },
    pep_check: Boolean, // Politically Exposed Person
    sanction_check: Boolean,
    adverse_media_check: Boolean
  },
  // Verification Metadata
  submitted_at: Date,
  verified_at: Date,
  reviewed_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User' // Admin who reviewed
  },
  review_notes: String,
  rejection_reason: String,
  next_review_date: Date, // For periodic re-verification
  // Audit Trail
  history: [{
    action: String,
    status: String,
    level: String,
    performed_by: mongoose.Schema.Types.ObjectId,
    timestamp: Date,
    notes: String
  }]
}, { timestamps: true });

module.exports = mongoose.model('KYC', KYCSchema);