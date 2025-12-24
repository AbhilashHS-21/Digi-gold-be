import express from 'express';
import { exportData } from '../controllers/adminController.js';
import { ensureAdmin } from '../middlewares/adminMiddleware.js';
import { settleSIP } from '../controllers/sipController.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';

const router = express.Router();

// GET /api/admin/export-excel
router.get('/export-excel', authMiddleware, ensureAdmin, exportData);

// POST /api/admin/settlements
router.post('/settlements', authMiddleware, ensureAdmin, settleSIP);

export default router;
