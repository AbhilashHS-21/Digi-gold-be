import prisma from "../config/db.js";

// Get all notifications for the logged-in user
export const getUserNotifications = async (req, res) => {
    try {
        const userId = req.user.id;
        const notifications = await prisma.notification.findMany({
            where: { user_id: userId },
            orderBy: { created_at: "desc" },
        });
        res.json(notifications);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Mark a single notification as read
export const markNotificationRead = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        // Ensure the notification belongs to the user
        const notification = await prisma.notification.findFirst({
            where: { id, user_id: userId },
        });

        if (!notification) {
            return res.status(404).json({ message: "Notification not found" });
        }

        const updatedNotification = await prisma.notification.update({
            where: { id },
            data: { is_read: true },
        });

        res.json(updatedNotification);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Mark all notifications as read
export const markAllRead = async (req, res) => {
    try {
        const userId = req.user.id;

        await prisma.notification.updateMany({
            where: { user_id: userId, is_read: false },
            data: { is_read: true },
        });

        res.json({ message: "All notifications marked as read" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

export const createNotification = async (req, res) => {
    try {
        const { user_id, title, message, type } = req.body;

        const notification = await prisma.notification.create({
            data: {
                user_id,
                title,
                message,
                type,
            },
        });

        res.json(notification);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
