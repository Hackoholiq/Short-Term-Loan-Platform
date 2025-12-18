const mongoose = require('mongoose');

const RepaymentSchema = new mongoose.Schema({
  due_date: { type: Date, required: true },
  amount: { type: Number, required: true },
  status: { 
    type: String, 
    enum: ['pending', 'paid', 'late', 'missed', 'partially_paid'], 
    default: 'pending' 
  },
  paid_date: Date,
  paid_amount: { type: Number, default: 0 },
  late_fee_applied: { type: Boolean, default: false },
  late_fee_amount: { type: Number, default: 0 }
});

const LoanSchema = new mongoose.Schema({
  // Core Loan Information
  user_id: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: [true, 'User ID is required'],
    index: true
  },
  loan_id: { // Human-readable loan identifier
    type: String,
    unique: true,
    sparse: true
  },
  loan_amount: { 
    type: Number, 
    required: [true, 'Loan amount is required'],
    min: [50, 'Minimum loan amount is $50'],
    max: [50000, 'Maximum loan amount is $50,000']
  },
  interest_rate: { 
    type: Number, 
    required: [true, 'Interest rate is required'],
    min: [0, 'Interest rate cannot be negative'],
    max: [100, 'Interest rate cannot exceed 100%']
  },
  
  // Loan Terms
  duration: { 
    type: Number, 
    required: [true, 'Loan duration is required'],
    min: [1, 'Minimum duration is 1 month'],
    max: [60, 'Maximum duration is 60 months']
  },
  duration_unit: {
    type: String,
    enum: ['months', 'weeks'],
    default: 'months'
  },
  
  // KYC & Compliance Fields - NEW
  kyc_requirements: {
    level_required: {
      type: String,
      enum: ['none', 'basic', 'enhanced'],
      default: function() {
        // Auto-determine based on loan amount
        if (this.loan_amount <= 1000) return 'none';
        if (this.loan_amount <= 5000) return 'basic';
        return 'enhanced';
      }
    },
    verified_at_application: {
      type: Boolean,
      default: false
    },
    user_kyc_status_at_application: {
      type: String,
      enum: ['not_started', 'in_progress', 'pending_review', 'verified', 'rejected', 'expired']
    },
    verification_method: {
      type: String,
      enum: ['manual', 'automated_api', 'hybrid', 'bypassed'],
      default: 'manual'
    },
    bypass_reason: String, // Why KYC was bypassed (e.g., "repeat_customer", "small_amount")
    bypassed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Admin who bypassed
    compliance_notes: [{
      note: String,
      added_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      added_at: { type: Date, default: Date.now }
    }]
  },
  
  // Risk Assessment - NEW
  risk_assessment: {
    score: { type: Number, default: 50, min: 0, max: 100 },
    level: { 
      type: String, 
      enum: ['low', 'medium', 'high', 'very_high'], 
      default: 'medium' 
    },
    factors: [{
      factor: String,
      weight: Number,
      description: String
    }],
    assessed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    assessed_at: Date
  },
  
  // Loan Status
  status: { 
    type: String, 
    enum: [
      'draft',           // Application started but not submitted
      'pending',         // Submitted, awaiting review
      'under_review',    // Being reviewed by admin
      'kyc_pending',     // Waiting for KYC verification
      'approved',        // Approved, ready for disbursement
      'disbursed',       // Funds sent to borrower
      'active',          // Loan is being repaid
      'late',            // Payments are overdue
      'default',         // Significant delinquency
      'repaid',          // Fully repaid
      'rejected',        // Application rejected
      'cancelled'        // Cancelled by borrower or admin
    ], 
    default: 'draft',
    index: true
  },
  
  // Payment Information
  repayment_date: { 
    type: Date, 
    required: [true, 'Repayment date is required'] 
  },
  monthly_payment: { type: Number }, // Calculated monthly payment
  total_repayment_amount: { type: Number }, // loan_amount + total_interest
  total_interest: { type: Number, default: 0 },
  
  // Repayment Tracking
  repayments: [RepaymentSchema],
  payments_made: { type: Number, default: 0 },
  payments_missed: { type: Number, default: 0 },
  total_paid: { type: Number, default: 0 },
  remaining_balance: { type: Number },
  last_payment_date: Date,
  next_payment_date: Date,
  
  // Disbursement Information
  disbursement_details: {
    method: {
      type: String,
      enum: ['bank_transfer', 'check', 'mobile_money', 'cash']
    },
    reference: String,
    disbursed_at: Date,
    disbursed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    bank_account_last4: String,
    transaction_id: String
  },
  
  // Application & Decision Tracking
  application_data: mongoose.Schema.Types.Mixed, // Store original application form data
  purpose: { 
    type: String,
    trim: true,
    maxlength: [500, 'Purpose cannot exceed 500 characters']
  },
  rejection_reason: String,
  rejection_details: [{
    field: String,
    issue: String,
    timestamp: { type: Date, default: Date.now }
  }],
  approved_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approved_at: Date,
  rejected_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rejected_at: Date,
  
  // Collections & Recovery
  collections_status: {
    type: String,
    enum: ['none', 'in_collections', 'settled', 'charged_off'],
    default: 'none'
  },
  collections_notes: [{
    note: String,
    added_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    added_at: { type: Date, default: Date.now }
  }],
  
  // Metadata
  created_at: { 
    type: Date, 
    default: Date.now 
  },
  updated_at: { 
    type: Date, 
    default: Date.now 
  },
  version: { type: Number, default: 1 } // For optimistic concurrency control
}, {
  timestamps: { 
    createdAt: 'created_at', 
    updatedAt: 'updated_at' 
  },
  toJSON: { 
    virtuals: true,
    transform: function(doc, ret) {
      // Remove sensitive fields when converting to JSON
      delete ret.application_data;
      delete ret.kyc_requirements.compliance_notes;
      return ret;
    }
  },
  toObject: { virtuals: true }
});

// Virtuals
LoanSchema.virtual('is_overdue').get(function() {
  if (this.status !== 'active') return false;
  const today = new Date();
  return this.next_payment_date && today > this.next_payment_date;
});

LoanSchema.virtual('days_overdue').get(function() {
  if (!this.is_overdue || !this.next_payment_date) return 0;
  const today = new Date();
  const diffTime = Math.abs(today - this.next_payment_date);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

LoanSchema.virtual('repayment_progress').get(function() {
  if (!this.total_repayment_amount || this.total_repayment_amount === 0) return 0;
  return (this.total_paid / this.total_repayment_amount) * 100;
});

// Check if KYC is satisfied for this loan
LoanSchema.virtual('kyc_satisfied').get(function() {
  // Retrieve user data (you'd need to populate this)
  if (!this.populated('user_id')) return false;
  
  const user = this.user_id;
  const requiredLevel = this.kyc_requirements.level_required;
  
  if (requiredLevel === 'none') return true;
  
  // Check if user's KYC meets requirements
  if (user.kyc.status !== 'verified') return false;
  
  // Check KYC level
  const userLevel = user.kyc.level;
  const levelHierarchy = { 'none': 0, 'basic': 1, 'enhanced': 2 };
  
  return levelHierarchy[userLevel] >= levelHierarchy[requiredLevel];
});

// Pre-save middleware
LoanSchema.pre('save', async function(next) {
  this.updated_at = new Date();
  
  // Generate loan ID if not present
  if (!this.loan_id && this.status !== 'draft') {
    const prefix = 'LN';
    const year = new Date().getFullYear().toString().slice(-2);
    const random = Math.floor(1000 + Math.random() * 9000);
    this.loan_id = `${prefix}${year}${random}`;
  }
  
  // Auto-calculate monthly payment if not set
  if (!this.monthly_payment && this.loan_amount && this.interest_rate && this.duration) {
    const monthlyRate = this.interest_rate / 100 / 12;
    this.monthly_payment = this.loan_amount * 
      (monthlyRate * Math.pow(1 + monthlyRate, this.duration)) / 
      (Math.pow(1 + monthlyRate, this.duration) - 1);
    
    this.total_repayment_amount = this.monthly_payment * this.duration;
    this.total_interest = this.total_repayment_amount - this.loan_amount;
    this.remaining_balance = this.total_repayment_amount;
  }
  
  // Set next payment date if loan is active/disbursed
  if ((this.status === 'disbursed' || this.status === 'active') && !this.next_payment_date) {
    const firstPayment = new Date(this.disbursement_details.disbursed_at || this.created_at);
    firstPayment.setMonth(firstPayment.getMonth() + 1);
    this.next_payment_date = firstPayment;
  }
  
  next();
});

// Methods
LoanSchema.methods.checkKYCRequirement = async function() {
  // This method checks if KYC is required and returns requirement details
  const User = mongoose.model('User');
  const user = await User.findById(this.user_id).select('kyc');
  
  if (!user) {
    throw new Error('User not found');
  }
  
  const requirements = {
    required: false,
    level_required: 'none',
    current_user_level: user.kyc.level,
    user_kyc_status: user.kyc.status,
    message: ''
  };
  
  // Determine KYC requirement based on loan amount
  if (this.loan_amount <= 1000) {
    requirements.required = false;
    requirements.level_required = 'none';
    requirements.message = 'No KYC required for loans up to $1,000';
  } else if (this.loan_amount <= 5000) {
    requirements.required = true;
    requirements.level_required = 'basic';
    requirements.message = 'Basic KYC required for loans $1,001 - $5,000';
  } else {
    requirements.required = true;
    requirements.level_required = 'enhanced';
    requirements.message = 'Enhanced KYC required for loans above $5,000';
  }
  
  // Update loan with KYC requirements
  this.kyc_requirements.level_required = requirements.level_required;
  this.kyc_requirements.user_kyc_status_at_application = user.kyc.status;
  
  return requirements;
};

LoanSchema.methods.canProceedToApproval = async function() {
  // Check if loan meets all requirements for approval
  const User = mongoose.model('User');
  const user = await User.findById(this.user_id);
  
  if (!user) return { canProceed: false, reason: 'User not found' };
  
  // Check KYC requirements
  if (this.kyc_requirements.level_required !== 'none') {
    if (user.kyc.status !== 'verified') {
      return { 
        canProceed: false, 
        reason: `KYC verification required (${user.kyc.status})`,
        required_action: 'complete_kyc'
      };
    }
    
    // Check KYC level
    const levelHierarchy = { 'none': 0, 'basic': 1, 'enhanced': 2 };
    const userLevel = user.kyc.level || 'none';
    
    if (levelHierarchy[userLevel] < levelHierarchy[this.kyc_requirements.level_required]) {
      return { 
        canProceed: false, 
        reason: `Higher KYC level required (${this.kyc_requirements.level_required})`,
        required_action: 'upgrade_kyc'
      };
    }
  }
  
  // Check if loan is expired (submitted too long ago)
  const submissionAge = (new Date() - this.created_at) / (1000 * 60 * 60 * 24);
  if (submissionAge > 30) {
    return { 
      canProceed: false, 
      reason: 'Loan application expired (older than 30 days)',
      required_action: 'reapply'
    };
  }
  
  return { canProceed: true };
};

LoanSchema.methods.addPayment = function(paymentData) {
  // Add a payment to the loan
  const payment = {
    due_date: paymentData.due_date || new Date(),
    amount: paymentData.amount,
    status: 'paid',
    paid_date: new Date(),
    paid_amount: paymentData.amount
  };
  
  this.repayments.push(payment);
  this.payments_made += 1;
  this.total_paid += paymentData.amount;
  this.remaining_balance -= paymentData.amount;
  
  // Update next payment date
  if (this.payments_made < this.duration) {
    const nextDate = new Date(this.next_payment_date || new Date());
    nextDate.setMonth(nextDate.getMonth() + 1);
    this.next_payment_date = nextDate;
  }
  
  // Update status if fully paid
  if (this.remaining_balance <= 0) {
    this.status = 'repaid';
  }
  
  return this.save();
};

// Static methods
LoanSchema.statics.findLoansRequiringKYC = async function() {
  return this.aggregate([
    {
      $lookup: {
        from: 'users',
        localField: 'user_id',
        foreignField: '_id',
        as: 'user'
      }
    },
    { $unwind: '$user' },
    {
      $match: {
        $or: [
          {
            'kyc_requirements.level_required': 'basic',
            'user.kyc.status': { $ne: 'verified' }
          },
          {
            'kyc_requirements.level_required': 'enhanced',
            $or: [
              { 'user.kyc.status': { $ne: 'verified' } },
              { 'user.kyc.level': { $ne: 'enhanced' } }
            ]
          }
        ],
        status: { $in: ['pending', 'under_review'] }
      }
    },
    {
      $project: {
        loan_id: 1,
        loan_amount: 1,
        status: 1,
        'user.first_name': 1,
        'user.last_name': 1,
        'user.email': 1,
        'user.kyc.status': 1,
        'user.kyc.level': 1,
        kyc_requirements: 1,
        created_at: 1
      }
    }
  ]);
};

// Indexes
LoanSchema.index({ user_id: 1, created_at: -1 });
LoanSchema.index({ status: 1, created_at: -1 });
LoanSchema.index({ loan_id: 1 }, { unique: true, sparse: true });
LoanSchema.index({ 'kyc_requirements.level_required': 1, status: 1 });
LoanSchema.index({ next_payment_date: 1 });
LoanSchema.index({ 'disbursement_details.disbursed_at': -1 });

module.exports = mongoose.model('Loan', LoanSchema);