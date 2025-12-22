// controllers/kycController.js
const cloudinary = require('../config/cloudinary');
const KYC = require('../models/KYC');

const uploadKycDocuments = async (req, res) => {
  try {
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'No files uploaded'
      });
    }

    const documents = Object.entries(req.files).map(([field, files]) => ({
      type: field,
      url: files[0].path,
      publicId: files[0].filename
    }));

    const kyc = await KYC.create({
      user: req.user.id,
      documents,
      status: 'pending_review'
    });

    res.status(201).json({
      status: 'success',
      message: 'KYC documents uploaded successfully',
      data: kyc
    });

  } catch (error) {
    console.error('🔥 KYC UPLOAD ERROR:', error);

  res.status(500).json({
    status: 'error',
    message: error.message,
    stack: error.stack
    });
  }
};

module.exports = { uploadKycDocuments };