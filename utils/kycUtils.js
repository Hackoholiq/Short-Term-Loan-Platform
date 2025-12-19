// KYC Utility Functions

/**
 * Calculate KYC progress percentage
 * @param {Object} kycData - KYC data object
 * @returns {number} Progress percentage (0-100)
 */
const calculateKYCProgress = (kycData) => {
  if (!kycData) return 0;
  
  let steps = 0;
  let completed = 0;
  
  // Check each verification step
  // Step 1: ID Verification
  if (kycData.id_verification?.document_images?.length > 0) completed++;
  steps++;
  
  // Step 2: Address Verification
  if (kycData.address_verification?.proof_document) completed++;
  steps++;
  
  // Step 3: Financial Info (for enhanced KYC only)
  if (kycData.level === 'enhanced') {
    if (kycData.financial_info?.income_proof) completed++;
    steps++;
  }
  
  // Step 4: Biometric/Liveness Check
  if (kycData.biometric_verification?.liveness_check) completed++;
  steps++;
  
  return Math.round((completed / steps) * 100);
};

/**
 * Determine next KYC step based on current data
 * @param {Object} kycData - KYC data object
 * @returns {string} Next step identifier
 */
const getNextKYCStep = (kycData) => {
  if (!kycData || kycData.status === 'not_started') return 'start';
  
  if (!kycData.id_verification?.document_images) return 'id_verification';
  if (!kycData.address_verification?.proof_document) return 'address_verification';
  if (kycData.level === 'enhanced' && !kycData.financial_info?.income_proof) return 'financial_info';
  if (!kycData.biometric_verification?.liveness_check) return 'liveness_check';
  if (kycData.status === 'in_progress') return 'submit';
  
  return 'complete';
};

/**
 * Format KYC status for display
 * @param {string} status - KYC status
 * @returns {string} Formatted status
 */
const formatKYCStatus = (status) => {
  const statusMap = {
    'not_started': 'Not Started',
    'in_progress': 'In Progress',
    'pending_review': 'Pending Review',
    'verified': 'Verified',
    'rejected': 'Rejected',
    'expired': 'Expired'
  };
  return statusMap[status] || status;
};

/**
 * Format KYC level for display
 * @param {string} level - KYC level
 * @returns {string} Formatted level
 */
const formatKYCLevel = (level) => {
  const levelMap = {
    'none': 'None',
    'basic': 'Basic',
    'enhanced': 'Enhanced'
  };
  return levelMap[level] || level;
};

/**
 * Get KYC status color for UI
 * @param {string} status - KYC status
 * @returns {string} CSS color
 */
const getKYCStatusColor = (status) => {
  const colors = {
    'not_started': '#6c757d',    // Gray
    'in_progress': '#ffc107',    // Yellow
    'pending_review': '#fd7e14', // Orange
    'verified': '#28a745',       // Green
    'rejected': '#dc3545',       // Red
    'expired': '#6c757d'         // Gray
  };
  return colors[status] || '#6c757d';
};

/**
 * Get KYC level color for UI
 * @param {string} level - KYC level
 * @returns {string} CSS color
 */
const getKYCLevelColor = (level) => {
  const colors = {
    'none': '#6c757d',      // Gray
    'basic': '#17a2b8',     // Teal
    'enhanced': '#dc3545'   // Red
  };
  return colors[level] || '#6c757d';
};

/**
 * Validate document file
 * @param {File} file - File object
 * @returns {Object} Validation result
 */
const validateDocumentFile = (file) => {
  if (!file) {
    return { valid: false, error: 'No file selected' };
  }
  
  const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
  const maxSize = 5 * 1024 * 1024; // 5MB
  
  if (!allowedTypes.includes(file.type)) {
    return { 
      valid: false, 
      error: 'File type not supported. Please upload JPG, PNG, or PDF files.' 
    };
  }
  
  if (file.size > maxSize) {
    return { 
      valid: false, 
      error: 'File too large. Maximum size is 5MB.' 
    };
  }
  
  return { valid: true, error: null };
};

/**
 * Format file size for display
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted file size
 */
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Get KYC requirements based on loan amount
 * @param {number} loanAmount - Loan amount
 * @returns {Object} KYC requirements
 */
const getKYCRequirements = (loanAmount) => {
  let required = false;
  let level = 'none';
  let message = '';
  
  if (loanAmount > 10000) {
    required = true;
    level = 'enhanced';
    message = 'Enhanced KYC required for loans above $10,000';
  } else if (loanAmount > 5000) {
    required = true;
    level = 'enhanced';
    message = 'Enhanced KYC required for loans above $5,000';
  } else if (loanAmount > 1000) {
    required = true;
    level = 'basic';
    message = 'Basic KYC required for loans above $1,000';
  }
  
  return { required, level, message };
};

/**
 * Check if user can submit loan based on KYC status
 * @param {Object} userKYC - User's KYC data
 * @param {Object} requirement - KYC requirement for loan amount
 * @returns {Object} Check result
 */
const canSubmitLoanWithKYC = (userKYC, requirement) => {
  if (!requirement.required) {
    return { canSubmit: true, reason: 'No KYC required for this loan amount' };
  }
  
  if (!userKYC) {
    return { 
      canSubmit: false, 
      reason: 'KYC not started',
      requiredLevel: requirement.level,
      currentLevel: 'none'
    };
  }
  
  if (userKYC.status !== 'verified') {
    return { 
      canSubmit: false, 
      reason: `KYC status is ${userKYC.status}`,
      requiredLevel: requirement.level,
      currentLevel: userKYC.level
    };
  }
  
  // Check level hierarchy
  const levelHierarchy = { 'none': 0, 'basic': 1, 'enhanced': 2 };
  const userLevel = levelHierarchy[userKYC.level] || 0;
  const requiredLevel = levelHierarchy[requirement.level] || 0;
  
  if (userLevel < requiredLevel) {
    return { 
      canSubmit: false, 
      reason: `Insufficient KYC level`,
      requiredLevel: requirement.level,
      currentLevel: userKYC.level
    };
  }
  
  return { canSubmit: true, reason: 'KYC verified' };
};

/**
 * Generate KYC audit trail entry
 * @param {string} action - Action performed
 * @param {string} performedBy - User ID who performed the action
 * @param {string} notes - Additional notes
 * @returns {Object} Audit trail entry
 */
const generateKYCAuditEntry = (action, performedBy, notes = '') => {
  return {
    action,
    timestamp: new Date(),
    performed_by: performedBy,
    notes
  };
};

/**
 * Check if KYC is expired
 * @param {Date} verifiedAt - Date when KYC was verified
 * @param {number} validityMonths - Validity period in months (default: 12)
 * @returns {boolean} True if expired
 */
const isKYCExpired = (verifiedAt, validityMonths = 12) => {
  if (!verifiedAt) return false;
  
  const expiryDate = new Date(verifiedAt);
  expiryDate.setMonth(expiryDate.getMonth() + validityMonths);
  
  return new Date() > expiryDate;
};

/**
 * Get time until KYC expiry
 * @param {Date} verifiedAt - Date when KYC was verified
 * @param {number} validityMonths - Validity period in months (default: 12)
 * @returns {Object} Time until expiry
 */
const getTimeUntilExpiry = (verifiedAt, validityMonths = 12) => {
  if (!verifiedAt) return { expired: true, days: 0, months: 0 };
  
  const expiryDate = new Date(verifiedAt);
  expiryDate.setMonth(expiryDate.getMonth() + validityMonths);
  
  const now = new Date();
  const timeDiff = expiryDate - now;
  
  if (timeDiff <= 0) {
    return { expired: true, days: 0, months: 0 };
  }
  
  const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
  const months = Math.floor(days / 30);
  
  return { 
    expired: false, 
    days: days % 30, 
    months,
    expiryDate 
  };
};

/**
 * Validate KYC personal information
 * @param {Object} personalInfo - Personal information object
 * @returns {Object} Validation result
 */
const validatePersonalInfo = (personalInfo) => {
  const errors = {};
  
  if (!personalInfo.full_name || personalInfo.full_name.trim().length < 2) {
    errors.full_name = 'Full name is required (minimum 2 characters)';
  }
  
  if (!personalInfo.date_of_birth) {
    errors.date_of_birth = 'Date of birth is required';
  } else {
    const dob = new Date(personalInfo.date_of_birth);
    const today = new Date();
    const age = today.getFullYear() - dob.getFullYear();
    
    if (age < 18) {
      errors.date_of_birth = 'Must be at least 18 years old';
    }
  }
  
  if (!personalInfo.nationality || personalInfo.nationality.trim().length < 2) {
    errors.nationality = 'Nationality is required';
  }
  
  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
};

/**
 * Generate KYC status badge for UI
 * @param {string} status - KYC status
 * @param {string} level - KYC level
 * @returns {string} HTML/CSS for badge
 */
const generateKYCStatusBadge = (status, level = 'none') => {
  const statusText = formatKYCStatus(status);
  const levelText = formatKYCLevel(level);
  const statusColor = getKYCStatusColor(status);
  const levelColor = getKYCLevelColor(level);
  
  // This returns a style object for React inline styles
  return {
    container: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px'
    },
    statusBadge: {
      backgroundColor: statusColor,
      color: 'white',
      padding: '4px 12px',
      borderRadius: '12px',
      fontSize: '12px',
      fontWeight: 'bold'
    },
    levelBadge: {
      backgroundColor: levelColor,
      color: 'white',
      padding: '4px 12px',
      borderRadius: '12px',
      fontSize: '12px',
      fontWeight: 'bold'
    }
  };
};

/**
 * Prepare KYC data for display
 * @param {Object} kycData - Raw KYC data
 * @returns {Object} Formatted KYC data for UI
 */
const prepareKYCForDisplay = (kycData) => {
  if (!kycData) {
    return {
      status: 'not_started',
      level: 'none',
      progress: 0,
      nextStep: 'start',
      canSubmit: false,
      formattedStatus: 'Not Started',
      formattedLevel: 'None'
    };
  }
  
  const progress = calculateKYCProgress(kycData);
  const nextStep = getNextKYCStep(kycData);
  
  return {
    ...kycData,
    progress,
    nextStep,
    formattedStatus: formatKYCStatus(kycData.status),
    formattedLevel: formatKYCLevel(kycData.level),
    statusColor: getKYCStatusColor(kycData.status),
    levelColor: getKYCLevelColor(kycData.level),
    isComplete: progress === 100,
    canSubmit: kycData.status === 'verified'
  };
};

// Export all utility functions
module.exports = {
  calculateKYCProgress,
  getNextKYCStep,
  formatKYCStatus,
  formatKYCLevel,
  getKYCStatusColor,
  getKYCLevelColor,
  validateDocumentFile,
  formatFileSize,
  getKYCRequirements,
  canSubmitLoanWithKYC,
  generateKYCAuditEntry,
  isKYCExpired,
  getTimeUntilExpiry,
  validatePersonalInfo,
  generateKYCStatusBadge,
  prepareKYCForDisplay
};