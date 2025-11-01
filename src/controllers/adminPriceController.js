import prisma from "../config/db.js";

export const addNewPrice = async (req, res) => {
  try {
    const { gold24K, gold22K, silver } = req.body;

    const sip = await prisma.AdminPrice.create({
      data: { gold24K, gold22K, silver },
    });

    res.status(201).json({ message: "Updated prices", sip });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
