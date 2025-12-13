import express from "express";
import { getAllTransactions, addTransaction, sellGold, verifyOfflineTransaction } from "../controllers/transactionController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/", authMiddleware, getAllTransactions);
router.post("/", authMiddleware, addTransaction);
router.post("/sell", authMiddleware, sellGold);
router.post("/verify-offline", authMiddleware, verifyOfflineTransaction);

export default router;