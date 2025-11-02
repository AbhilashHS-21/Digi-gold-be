import express from "express";
import { createFixedSip, createFlexibleSip, getUserSips, optFixedSip } from "../controllers/sipController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { ensureAdmin } from '../middlewares/adminMiddleware.js'

const router = express.Router();
router.post("/fixed/create", ensureAdmin, authMiddleware, createFixedSip);

router.post("/fixed/opt", authMiddleware, optFixedSip);
router.post("/flexible/opt", authMiddleware, createFlexibleSip);
router.get("/", authMiddleware, getUserSips);

export default router;
