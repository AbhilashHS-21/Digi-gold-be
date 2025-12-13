import express from "express";
import { getAllTransactions, addTransaction, sellGold } from "../controllers/transactionController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/", authMiddleware, getAllTransactions);
router.post("/", authMiddleware, addTransaction);
router.post("/sell", authMiddleware, sellGold);

export default router;