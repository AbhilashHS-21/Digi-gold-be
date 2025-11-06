import express from "express";
import {
  paySipInstallment,
  getSipTransactions,
} from "../controllers/transactionController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/pay", authMiddleware, paySipInstallment);
router.get("/", authMiddleware, getSipTransactions);

export default router;
