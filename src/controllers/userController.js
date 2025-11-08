import bcrypt from "bcryptjs";
import prisma from "../config/db.js";
import { generateToken } from "../utils/jwt.js";

export const update = async (req, res) => {
  try {
    const {
      username,
      email,
      password,
      first_name,
      last_name,
      phone,
      gender,
      dob,
      pincode,
      address1,
      address2,
      city,
      state,
    } = req.body;

    const exists = await prisma.user.findFirst({
      where: { OR: [{ username }, { email }] },
    });
    if (exists) return res.status(400).json({ message: "User already exists" });

    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.update({
      data: {
        username,
        email,
        hashed,
        first_name,
        last_name,
        phone,
        gender,
        dob,
        pincode,
        address1,
        address2,
        city,
        state,
      },
    });

    const token = generateToken({ id: user.id, email: user.email });
    res.status(201).json({ message: "User details updated successfully", token, user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
