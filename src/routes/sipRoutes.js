import express from "express";
import { createFixedSip, getUserSips } from "../controllers/sipController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

const router = express.Router();
router.post("/fixed", authMiddleware, createFixedSip);
router.get("/", authMiddleware, getUserSips);

export default router;
