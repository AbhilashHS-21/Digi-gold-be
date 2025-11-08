import express from "express";
import { update } from "../controllers/userController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

const router = express.Router();
router.put("/", authMiddleware, update);

export default router;