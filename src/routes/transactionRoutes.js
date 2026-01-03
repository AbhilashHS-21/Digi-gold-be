import express from "express";
import {
    getAllTransactions,
    addTransaction,
    sellGold,
    verifyOfflineTransaction,
    paySipInstallment,
    getSipTransactions
} from "../controllers/transactionController.js";
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { checkMarketStatus } from '../middlewares/marketStatusMiddleware.js';

const router = express.Router();

router.get("/all-transactions", authMiddleware, getAllTransactions);
router.get("/sip-transactions", authMiddleware, getSipTransactions);
router.post("/add-transaction", authMiddleware, checkMarketStatus, addTransaction);
router.post("/sell-gold", authMiddleware, checkMarketStatus, sellGold);
router.post("/pay-sip", authMiddleware, paySipInstallment);
router.post("/verify-offline", authMiddleware, verifyOfflineTransaction);

export default router;