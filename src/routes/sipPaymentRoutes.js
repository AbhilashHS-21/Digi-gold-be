// routes/sipPaymentRoutes.js
import express from "express";
// Remove the named import and use the actual function from your controller
import { paySipInstallment } from "../controllers/transactionController.js";
import { getSipTransactions } from '../controllers/transactionController.js';
import { authMiddleware } from "../middlewares/authMiddleware.js";

const router = express.Router();

// router.post("/pay", authMiddleware, paySipInstallment);
router.get("/", authMiddleware, getSipTransactions);

export default router;