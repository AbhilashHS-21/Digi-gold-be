import prisma from "../config/db.js";

export const ensureAdmin = async (req, res, next) => {
  // req.user is set by authMiddleware and contains user_type
  if (!req.user) return res.status(401).json({ message: "Unauthorized" });

  const dbuser = await prisma.user.findUnique({
    where: {
      email: req.user.email, // Replace with your desired ID
    },
    select: {
      user_type: true, // Selects only the 'email' column
    },
  });

  if (dbuser.user_type !== "admin") {
    return res.status(403).json({ message: "Requires admin role" });
  }
  next();
};
