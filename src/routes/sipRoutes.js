import express from "express";
import { createFixedSip, createFlexibleSip, getUserSips, optFixedSip, getAllUsersSips } from "../controllers/sipController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { ensureAdmin } from '../middlewares/adminMiddleware.js'

const router = express.Router();
router.post("/fixed/create", authMiddleware, ensureAdmin, createFixedSip);
router.get("/", authMiddleware, ensureAdmin, getAllUsersSips);

router.post("/fixed/opt", authMiddleware, optFixedSip);
router.post("/flexible/create", authMiddleware, createFlexibleSip);
router.get("/", authMiddleware, getUserSips);

export default router;
