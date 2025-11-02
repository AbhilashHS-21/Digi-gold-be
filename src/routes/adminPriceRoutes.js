import express from "express";
import { addNewPrice, getlatestPrice } from "../controllers/adminPriceController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { ensureAdmin } from "../middlewares/adminMiddleware.js";

const router = express.Router();
router.post("/add", authMiddleware, ensureAdmin, addNewPrice);
router.get("/", authMiddleware, getlatestPrice);

export default router;