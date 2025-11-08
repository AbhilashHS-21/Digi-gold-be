import { SipStatus } from "@prisma/client";
import prisma from "../config/db.js";
import { addMonths } from "date-fns";

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

    // Check if plan exists
    const plan = await prisma.sipPlanAdmin.findUnique({ where: { id: sip_plan_id } });
    if (!plan) return res.status(404).json({ message: "Invalid SIP plan" });

    // Prevent duplicate active SIP of same plan
    const existing = await prisma.fixedSip.findFirst({
      where: { user_id: userId, sip_plan_id, status: "ACTIVE" },
    });
    if (existing)
      return res.status(409).json({ message: "You already have an active SIP for this plan." });

    const nextDue = addMonths(new Date(), 1);

    const sip = await prisma.fixedSip.create({
      data: {
        user_id: userId,
        sip_plan_id,
        total_amount_paid: 0,
        months_paid: 0,
        next_due_date: nextDue,
        status: SipStatus.ACTIVE,
      },
      include: { sipPlanAdmin: true },
    });

    res.status(201).json({ message: "Fixed SIP created successfully", sip });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// flexible SIP

export const createFlexibleSip = async (req, res) => {
  try {
    const userId = req.user.id;
    const { metal_type, total_months } = req.body;

    // Prevent multiple active SIPs of same metal
    const existing = await prisma.flexibleSip.findFirst({
      where: { user_id: userId, metal_type, status: "ACTIVE" },
    });
    if (existing)
      return res.status(409).json({ message: "You already have an active flexible SIP for this metal." });

    const nextDue = addMonths(new Date(), 1);

    const sip = await prisma.flexibleSip.create({
      data: {
        user_id: userId,
        metal_type,
        total_amount_paid: 0,
        months_paid: 0,
        total_months,
        next_due_date: nextDue,
        status: SipStatus.ACTIVE },
    });

    res.status(201).json({ message: "Flexible SIP created", sip });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getUserSips = async (req, res) => {
  try {
    const userId = req.user.id;
     const [sipsFixed, sipsFlexible] = await Promise.all([
      prisma.fixedSip.findMany({
        where: { user_id: userId },
        include: { sipPlanAdmin: true },
        orderBy: { created_at: "desc" },
      }),
      prisma.flexibleSip.findMany({
        where: { user_id: userId },
        orderBy: { created_at: "desc" },
      }),
    ]);

    res.json({sipsFixed, sipsFlexible});
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getAllUsersSips = async (req, res) => {
  try {
    const [sipsFixed, sipsFlexible] = await Promise.all([
      prisma.fixedSip.findMany({
        include: { sipPlanAdmin: true },
        orderBy: { created_at: "desc" },
      }),
      prisma.flexibleSip.findMany({
        orderBy: { created_at: "desc" },
      }),
    ]);

    res.json({ sipsFixed, sipsFlexible });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}