const mongoose = require('mongoose');

const KYCSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    // =====================
    // KYC STATUS & LEVEL
    // =====================
    status: {
      type: String,
      enum: [
        'not_started',
        'in_progress',
        'pending_review',
        'verified',
        'rejected',
        'expired'
      ],
      default: 'not_started',
      required: true
    },

    level: {
      type: String,
      enum: ['none', 'basic', 'enhanced'],
      default: 'none',
      required: true
    },

    // =====================
    // PERSONAL INFORMATION
    // =====================
    personal_info: {
      full_name: String,
      date_of_birth: Date,
      gender: String,
      nationality: String,
      place_of_birth: String
    },

    // =====================
    // ID VERIFICATION
    // =====================
    id_verification: {
      document_type: {
        type: String,
        enum: [
          'passport',
          'national_id',
          'drivers_license',
          'voters_card',
          'other'
        ]
      },
      document_number: String,
      issue_date: Date,
      expiry_date: Date,
      issuing_country: String,

      // Cloudinary URLs
      document_images: {
        type: [String],
        default: []
      },

      verified: {
        type: Boolean,
        default: false
      },
      verification_date: Date,
      verification_method: {
        type: String,
        enum: ['auto', 'manual']
      }
    },

    // =====================
    // ADDRESS VERIFICATION
    // =====================
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
        enum: [
          'utility_bill',
          'bank_statement',
          'lease_agreement',
          'tax_document',
          'other'
        ]
      },
      proof_document: String,
      verified: {
        type: Boolean,
        default: false
      },
      verification_date: Date
    },

    // =====================
    // FINANCIAL INFORMATION (ENHANCED KYC)
    // =====================
    financial_info: {
      employment_status: String,
      occupation: String,
      employer_name: String,
      monthly_income: Number,
      income_source: String,
      income_proof: String,
      verified: {
        type: Boolean,
        default: false
      }
    },

    // =====================
    // BIOMETRIC VERIFICATION
    // =====================
    biometric_verification: {
      liveness_check: Boolean,
      facial_recognition_match: Boolean,
      confidence_score: Number,
      verification_date: Date
    },

    // =====================
    // RISK ASSESSMENT
    // =====================
    risk_assessment: {
      risk_score: Number,
      risk_level: {
        type: String,
        enum: ['low', 'medium', 'high']
      },
      pep_check: Boolean,
      sanction_check: Boolean,
      adverse_media_check: Boolean
    },

    // =====================
    // VERIFICATION METADATA
    // =====================
    submitted_at: Date,
    verified_at: Date,

    reviewed_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },

    review_notes: String,
    rejection_reason: String,
    next_review_date: Date,

    // =====================
    // AUDIT TRAIL
    // =====================
    history: [
      {
        action: String,
        status: {
          type: String,
          enum: [
            'not_started',
            'in_progress',
            'pending_review',
            'verified',
            'rejected',
            'expired'
          ]
        },
        level: {
          type: String,
          enum: ['none', 'basic', 'enhanced']
        },
        performed_by: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        timestamp: {
          type: Date,
          default: Date.now
        },
        notes: String
      }
    ]
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('KYC', KYCSchema);