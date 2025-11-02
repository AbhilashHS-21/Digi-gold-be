// src/routes/kycRoutes.js
import express from "express";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { ensureAdmin } from "../middlewares/adminMiddleware.js";
import { upsertPan, upsertBank, getMyKyc, adminGetKyc, adminSetKycStatus } from "../controllers/kycController.js";

const router = express.Router();

// User endpoints
router.post("/pan", authMiddleware, upsertPan); // submit/update PAN
router.post("/bank", authMiddleware, upsertBank); // submit/update Bank
router.get("/me", authMiddleware, getMyKyc); // my kyc masked

// Admin endpoints
router.get("/admin/:userId", authMiddleware, ensureAdmin, adminGetKyc); // view decrypted
router.post("/admin/:userId/status", authMiddleware, ensureAdmin, adminSetKycStatus);

export default router;
