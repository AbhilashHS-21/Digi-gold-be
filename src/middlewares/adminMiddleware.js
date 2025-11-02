export const ensureAdmin = (req, res, next) => {
  // assuming req.user is set by authMiddleware and contains user_type
  if (!req.user) return res.status(401).json({ message: "Unauthorized" });
  if (req.user.user_type !== "admin") {
    return res.status(403).json({ message: "Requires admin role" });
  }
  next();
};
