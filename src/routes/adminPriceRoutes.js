import express from "express";
import { addNewPrice } from "../controllers/adminPriceController.js";

const router = express.Router();
router.post("/add", addNewPrice);

export default router;