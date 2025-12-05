import express from "express";
import {
    getUserNotifications,
    markNotificationRead,
    markAllRead,
    createNotification,
} from "../controllers/notificationController.js";
import { authenticateUser } from "../middlewares/authMiddleware.js"; // Assuming you have this

const router = express.Router();

router.use(authenticateUser);

router.get("/", getUserNotifications);
router.put("/:id/read", markNotificationRead);
router.put("/read-all", markAllRead);
router.post("/create", createNotification);

export default router;
