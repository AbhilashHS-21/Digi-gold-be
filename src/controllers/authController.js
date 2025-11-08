import bcrypt from "bcryptjs";
import prisma from "../config/db.js";
import { generateToken } from "../utils/jwt.js";

export const register = async (req, res) => {
  try {
    const { username, email, password, first_name, last_name } =
      req.body;

    const exists = await prisma.user.findFirst({
      where: { OR: [{ username }, { email }] },
    });
    if (exists) return res.status(400).json({ message: "User already exists" });

    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        username,
        email,
        password_hash: hashed,
        first_name,
        last_name,
        user_type : 'customer',
      },
    });

    const token = generateToken({ id: user.id, email: user.email });
    res.status(201).json({ message: "User registered", token, user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ message: "User not found" });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ message: "Invalid credentials" });

    const token = generateToken({ id: user.id, email: user.email });
    res.json({ message: "Login successful", token });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
