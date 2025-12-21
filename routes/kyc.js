import express from 'express';
import upload from '../middleware/upload.js';
import { uploadKycDocuments } from '../controllers/kycController.js';
import auth from '../middleware/auth.js';

const router = express.Router();

router.post(
  '/documents/upload',
  auth,
  upload.array('files', 3),
  uploadKycDocuments
);

export default router;