import express from 'express';
import { initiateKyc, handleCallback, fetchAadhaar, fetchPan } from '../controllers/kycController.js';

const router = express.Router();

router.post('/initiate', initiateKyc);
router.get('/callback', handleCallback);
router.get('/aadhaar', fetchAadhaar);
router.get('/pan', fetchPan);

export default router;
