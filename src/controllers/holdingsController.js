import prisma from "../config/db.js";

export const getHoldings = async (req, res) => {
  try {
    const userId = req.user.id;
    const holdings = await prisma.holding.findMany({
      where: { user_id: userId },
    });
    const sipsFixed = await prisma.fixedSip.findMany({
      where: { user_id: userId },
      // include: { total_amount_paid: true },
    });
    const sipsFlexible = await prisma.flexibleSip.findMany({
      where: { user_id: userId },
      // include: { total_amount_paid: true },
    });
    res.json({ holdings, sipsFixed, sipsFlexible });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const updateHoldings = async (req, res) => {
  try {
    const userId = req.user.id;
    const { metal_type, amt, qty } = req.body;

    const holding = await prisma.holding.upsert({
      where: {
        user_id_metal_type: {
          user_id: userId,
          metal_type,
        },
      },
      update: { amt, qty, updated_at: new Date() },
      create: { user_id: userId, metal_type, amt, qty },
    });

    res.json({ message: "Holdings updated", holding });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
