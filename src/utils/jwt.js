import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET || "supersecret";

export function generateToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: "7d" }); // Change to 1h in prod
}

export function verifyToken(token) {
  return jwt.verify(token, SECRET);
}
