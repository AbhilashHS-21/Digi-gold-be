// middlewares/adminMiddleware.js
import prisma from "../config/db.js";

export const ensureAdmin = async (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: "Unauthorized" });

  const dbuser = await prisma.user.findUnique({
    where: {
      email: req.user.email,
    },
    select: {
      user_type: true,
    },
  });

  if (!dbuser || dbuser.user_type !== "admin") {
    return res.status(403).json({ message: "Requires admin role" });
  }
  next();
};