import express from 'express';
import upload from '../middleware/upload.js';
import { uploadKycDocument } from '../controllers/kycController.js';

const router = express.Router();

router.post('/upload', upload.single('document'), uploadKycDocument);

export default router;