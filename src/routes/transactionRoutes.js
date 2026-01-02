// routes/transactionRoutes.js
import express from "express";
import { 
  getAllTransactions, 
  addTransaction, 
  sellGold, 
  verifyOfflineTransaction,
  paySipInstallment,
  getSipTransactions 
} from "../controllers/transactionController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { requireMarketOpen, checkMarketOpen } from "../middlewares/marketStatusMiddleware.js";

const router = express.Router();

// GET routes
router.get("/", authMiddleware, getAllTransactions);
router.get("/sip", authMiddleware, getSipTransactions);

// POST routes with market status checks
router.post("/", authMiddleware, checkMarketOpen, requireMarketOpen, addTransaction);
router.post("/sell", authMiddleware, checkMarketOpen, requireMarketOpen, sellGold);
router.post("/sip-payment", authMiddleware, checkMarketOpen, requireMarketOpen, paySipInstallment);
router.post("/verify-offline", authMiddleware, verifyOfflineTransaction);

// Remove these duplicate lines that don't have imported functions
// router.post("/create", authMiddleware, checkMarketOpen, requireMarketOpen, createTransaction);
// router.post("/buy", authMiddleware, checkMarketOpen, requireMarketOpen, buyMetal);

export default router;