import express from "express";
import { update, getUserDetails } from "../controllers/userController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

const router = express.Router();
router.put("/", authMiddleware, update);
router.get("/details", authMiddleware, getUserDetails); // /api/user/details

export default router;