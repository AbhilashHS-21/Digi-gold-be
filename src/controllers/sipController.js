import prisma from "../config/db.js";

export const createFixedSip = async (req, res) => {
  try {
    const userId = req.user.id;
    const { sip_plan_id } = req.body;

    const sip = await prisma.fixedSip.create({
      data: { user_id: userId, sip_plan_id },
    });

    res.status(201).json({ message: "Fixed SIP created", sip });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getUserSips = async (req, res) => {
  try {
    const userId = req.user.id;
    const sips = await prisma.fixedSip.findMany({
      where: { user_id: userId },
      include: { sipPlanAdmin: true },
    });
    res.json(sips);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// flexible SIP
