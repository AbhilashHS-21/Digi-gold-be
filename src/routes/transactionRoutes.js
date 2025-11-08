import express from "express";
import { getAllTransactions, addTransaction } from "../controllers/transactionController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/", authMiddleware, getAllTransactions);
router.post("/", authMiddleware, addTransaction);

export default router;