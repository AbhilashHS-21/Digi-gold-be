import express from "express";
import {
  getHoldings,
  updateHoldings,
} from "../controllers/holdingsController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

const router = express.Router();
router.get("/", authMiddleware, getHoldings);
router.post("/", authMiddleware, updateHoldings);

export default router;
