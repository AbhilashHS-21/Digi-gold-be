import bcrypt from "bcryptjs";
import prisma from "../config/db.js"; // adjust your import path
import { generateToken } from "../utils/jwt.js"; // adjust your import path
import { toDate } from "date-fns";

// Utility: removes undefined keys so Prisma doesn't try to update them
const filterUndefinedFields = (obj) =>
  Object.fromEntries(Object.entries(obj).filter(([_, v]) => v !== undefined));

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

    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Check if another user has same username or email
    const exists = await prisma.user.findFirst({
      where: {
        OR: [{ username }, { email }],
        NOT: { id: userId },
      },
    });

    if (exists) {
      return res
        .status(400)
        .json({ message: "Username or email already taken" });
    }

    // Hash new password only if provided
    const hashed = password ? await bcrypt.hash(password, 10) : undefined;

    // Build update data dynamically
    const data = filterUndefinedFields({
      username,
      email,
      password_hash: hashed,
      first_name,
      last_name,
      phone,
      gender,
      dob: toDate(dob),
      pincode,
      address1,
      address2,
      city,
      state,
    });

    const user = await prisma.user.update({
      where: { id: userId },
      data,
    });

    const token = generateToken({ id: user.id, email: user.email });

    res.status(200).json({
      message: "User details updated successfully",
      token,
      user,
    });
  } catch (err) {
    console.error("Error updating user:", err);
    res.status(500).json({ message: err.message });
  }
};
