import prisma from "../config/db.js";

/**
 * Middleware to check if the market is open for transactions.
 * Default Hours: 10:00 AM - 6:00 PM IST.
 * Admin Override: Checked via SystemSetting 'MARKET_STATUS' (OPEN, CLOSED).
 */
export const checkMarketStatus = async (req, res, next) => {
    try {
        // 1. Check Admin Override
        const setting = await prisma.systemSetting.findUnique({
            where: { key: "MARKET_STATUS" },
        });

        const status = setting?.value || "OPEN";

        if (status === "OPEN") {
            // 2. AUTO: Check Time (10 AM - 6 PM IST)
            // Server time is expected to be in a timezone, but we need strictly IST (UTC+5:30).
            const now = new Date();

            // Get IST time string to avoid server timezone issues
            const istTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
            const currentHour = istTime.getHours();
            const currentMinute = istTime.getMinutes();

            // 10:00 AM to 6:00 PM (18:00)
            // Closed before 10
            if (currentHour < 10) {
                return res.status(403).json({
                    message: "Market is closed. Opens at 10:00 AM IST.",
                    error: "MARKET_CLOSED_TIME",
                    marketHours: "10:00 AM - 6:00 PM IST"
                });
            }

            // Closed after 6 PM (18:00)
            // strictly > 18 or >= 18? usually 6:00 PM is close time. so >= 18 is closed.
            if (currentHour >= 18) {
                return res.status(403).json({
                    message: "Market is closed. Closed at 6:00 PM IST.",
                    error: "MARKET_CLOSED_TIME",
                    marketHours: "10:00 AM - 6:00 PM IST"
                });
            }

            next();
        }

        if (status === "CLOSED") {
            return res.status(403).json({
                message: "Market is currently closed by admin.",
                error: "MARKET_CLOSED_ADMIN",
            });
        }
    } catch (error) {
        console.error("Error checking market status:", error);
        return res.status(500).json({ message: "Unable to verify market status" });
    }
};
