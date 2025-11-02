import { SipStatus } from "@prisma/client";
import prisma from "../config/db.js";

export const createFixedSip = async (req, res) => {
  try {
    const { Yojna_name, metal_type, range_amount, total_months } = req.body;

    const sipPlanAdmin = await prisma.sipPlanAdmin.create({
      data: { Yojna_name, metal_type, range_amount, total_months },
    });

    res.status(201).json({ message: "Fixed SIP created", sipPlanAdmin });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

export const optFixedSip = async (req, res) => {
  try {
    const userId = req.user.id;
    const { sip_plan_id } = req.body;

    const sip = await prisma.fixedSip.create({
      data: { user_id: userId, sip_plan_id, status: SipStatus.ACTIVE },
    });

    res.status(201).json({ message: "Fixed SIP created", sip });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// flexible SIP

export const createFlexibleSip = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      total_amount_paid,
      metal_type,
      months_paid,
      total_months,
      next_due_date,
    } = req.body;

    const sip = await prisma.fixedSip.create({
      data: { userId, total_amount_paid, metal_type, months_paid, 
        total_months, next_due_date, status: SipStatus.ACTIVE },
    });

    res.status(201).json({ message: "Fixed SIP created", sip });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getUserSips = async (req, res) => {
  try {
    const userId = req.user.id;
    const sipsFixed = await prisma.fixedSip.findMany({
      where: { user_id: userId },
      include: { sipPlanAdmin: true },
    });
    const sipsFlexible = await prisma.fixedSip.findMany({
      where: { user_id: userId },
    });
    res.json(sipsFixed, sipsFlexible);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};