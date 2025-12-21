import cloudinary from '../config/cloudinary.js';
import fs from 'fs';

export const uploadKycDocument = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: 'kyc_documents',
      resource_type: 'auto',
      tags: ['kyc', 'verification']
    });

    fs.unlinkSync(req.file.path); // cleanup temp file

    res.json({
      success: true,
      publicId: result.public_id,
      url: result.secure_url
    });
  } catch (error) {
    console.error('KYC upload error:', error);
    res.status(500).json({ message: 'KYC upload failed' });
  }
};