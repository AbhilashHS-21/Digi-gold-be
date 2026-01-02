// routes/marketStatusRoutes.js
import express from "express";
import { 
  getMarketStatus, 
  updateMarketStatus, 
  getMarketStatusHistory 
} from "../controllers/marketStatusController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { ensureAdmin } from "../middlewares/adminMiddleware.js";
import { checkMarketOpen } from "../middlewares/marketStatusMiddleware.js";

const router = express.Router();

// Public route to check market status
router.get("/", checkMarketOpen, getMarketStatus);

// Admin routes
router.put("/", authMiddleware, ensureAdmin, updateMarketStatus);
router.get("/history", authMiddleware, ensureAdmin, getMarketStatusHistory);

export default router;