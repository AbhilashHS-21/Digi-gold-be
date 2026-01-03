import express from 'express';
import { exportData, updateMarketStatus, getMarketStatus } from '../controllers/adminController.js';
import { ensureAdmin } from '../middlewares/adminMiddleware.js';
import { settleSIP } from '../controllers/sipController.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { getAllUsersCompletedAndSettledSips } from '../controllers/sipController.js';

const router = express.Router();

// GET /api/admin/export-excel
router.get('/export-excel', authMiddleware, ensureAdmin, exportData);

// POST /api/admin/settlements
router.post('/settlements', authMiddleware, ensureAdmin, settleSIP);

// GET /api/admin/completed-settled-sips
router.get('/completed-settled-sips', authMiddleware, ensureAdmin, getAllUsersCompletedAndSettledSips);

// Market Status Management
router.get('/market-status', authMiddleware, ensureAdmin, getMarketStatus);
router.post('/market-status', authMiddleware, ensureAdmin, updateMarketStatus);

export default router;
