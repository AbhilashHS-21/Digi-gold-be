import express from "express";
import { update } from "../controllers/userController.js";

const router = express.Router();
router.put("/", update);

export default router;