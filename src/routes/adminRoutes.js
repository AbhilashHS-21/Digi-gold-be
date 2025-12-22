import express from 'express';
import { exportData } from '../controllers/adminController.js';
import { ensureAdmin } from '../middlewares/adminMiddleware.js';

const router = express.Router();

// GET /api/admin/export-excel
router.get('/export-excel', ensureAdmin, exportData);

export default router;
