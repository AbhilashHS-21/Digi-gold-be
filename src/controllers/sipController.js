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

export const getFixedSips = async (req, res) => {
  try {
    const fixedSips = await prisma.sipPlanAdmin.findMany({
    });
    res.json(fixedSips);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

export const optFixedSip = async (req, res) => {
  try {
    const userId = req.user.id;
    const { sipPlanId } = req.body;
    console.log(sipPlanId);

    // Check if plan exists
    const plan = await prisma.sipPlanAdmin.findUnique({ where: { id: sipPlanId } });
    if (!plan) return res.status(404).json({ message: "Invalid SIP plan" });

    // Prevent duplicate active SIP of same plan
    const existing = await prisma.fixedSip.findFirst({
      where: { user_id: userId, sip_plan_id: sipPlanId, status: "ACTIVE" },
    });
    if (existing)
      return res.status(409).json({ message: "You already have an active SIP for this plan." });

    const nextDue = addMonths(new Date(), 1);

    const sip = await prisma.fixedSip.create({
      data: {
        user_id: userId,
        sip_plan_id: sipPlanId,
        total_amount_paid: 0,
        months_paid: 0,
        next_due_date: nextDue,
        status: SipStatus.ACTIVE,
      },
      include: { sipPlanAdmin: true },
    });

    res.status(201).json({ message: "Fixed SIP created successfully", sip });
  } catch (err) {
    console.log(err)
    res.status(500).json({ message: "Error choosing sip" });
  }
};

// flexible SIP

export const createFlexibleSip = async (req, res) => {
  try {
    const userId = req.user.id;
    const { metal_type, total_months } = req.body;

    // Prevent multiple active SIPs of same metal
    // const existing = await prisma.flexibleSip.findFirst({
    //   where: { user_id: userId, metal_type, status: "ACTIVE" },
    // });
    // if (existing)
    //   return res.status(409).json({ message: "You already have an active flexible SIP for this metal." });

    const nextDue = addMonths(new Date(), 1);

    const sip = await prisma.flexibleSip.create({
      data: {
        user_id: userId,
        metal_type,
        total_amount_paid: 0,
        months_paid: 0,
        total_months,
        next_due_date: nextDue,
        status: SipStatus.ACTIVE
      },
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

    res.json({ sipsFixed, sipsFlexible });
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

export const convertSipToHolding = async (req, res) => {
  try {
    const userId = req.user.id;
    const { sip_id, sip_type } = req.body; // sip_type: 'FIXED' | 'FLEXIBLE'

    if (!["FIXED", "FLEXIBLE"].includes(sip_type)) {
      return res.status(400).json({ message: "Invalid SIP type" });
    }

    // 1. Fetch latest price
    const latestPrice = await prisma.adminPrice.findFirst({
      orderBy: { updated_at: "desc" },
    });

    if (!latestPrice) {
      return res.status(500).json({ message: "Current prices unavailable" });
    }

    await prisma.$transaction(async (tx) => {
      let sip;
      let metalType;

      // 2. Fetch SIP & Validate
      if (sip_type === "FIXED") {
        sip = await tx.fixedSip.findUnique({
          where: { id: sip_id },
          include: { sipPlanAdmin: true }
        });
        if (!sip) throw new Error("SIP not found");
        metalType = sip.sipPlanAdmin.metal_type;
      } else {
        sip = await tx.flexibleSip.findUnique({ where: { id: sip_id } });
        if (!sip) throw new Error("SIP not found");
        metalType = sip.metal_type;
      }

      if (sip.user_id !== userId) throw new Error("Unauthorized");
      if (sip.status !== "COMPLETED") throw new Error("SIP is not mature yet");
      // Check if already converted? Schema enum handles status, so if it is CONVERTED it won't be COMPLETED.

      const currentPrice = Number(latestPrice[metalType]);
      if (!currentPrice) throw new Error("Price not found for metal");

      // 3. Calculate Gold Quantity to credit
      // user has total_amount_paid. We buy gold at current rate.
      const goldQty = Number(sip.total_amount_paid) / currentPrice;

      // 4. Update Holdings
      // Upsert logic similar to holdingsController
      const existingHolding = await tx.holding.findFirst({
        where: { user_id: userId, metal_type: metalType }
      });

      if (existingHolding) {
        await tx.holding.update({
          where: { id: existingHolding.id },
          data: {
            amt: { increment: sip.total_amount_paid },
            qty: { increment: goldQty },
            updated_at: new Date()
          }
        });
      } else {
        await tx.holding.create({
          data: {
            user_id: userId,
            metal_type: metalType,
            amt: sip.total_amount_paid,
            qty: goldQty
          }
        });
      }

      // 5. Create Transaction record
      await tx.transaction.create({
        data: {
          user_id: userId,
          transaction_amt: sip.total_amount_paid,
          transaction_type: "SIP_CONVERSION",
          category: "CREDIT", // Crediting gold (technically debiting cash from SIP?)
          // Actually transaction_amt usually refers to currency.
          // We are "Crediting" the portfolio.
          transaction_status: "SUCCESS",
          sip_id: sip.id,
          sip_type: sip_type,
          utr_no: `CONVERT-${sip_id}-${Date.now()}`
        }
      });

      // 6. Update SIP status
      if (sip_type === "FIXED") {
        await tx.fixedSip.update({
          where: { id: sip_id },
          data: { status: "CONVERTED" }
        });
      } else {
        await tx.flexibleSip.update({
          where: { id: sip_id },
          data: { status: "CONVERTED" }
        });
      }
    });

    res.status(200).json({ message: "SIP Converted to Holdings successfully" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

export const settleSIP = async (req, res) => {
  try {
    const userId = req.user.id;
    const { sip_id, sip_type } = req.body; // sip_type: 'FIXED' | 'FLEXIBLE'

    if (!["FIXED", "FLEXIBLE"].includes(sip_type)) {
      return res.status(400).json({ message: "Invalid SIP type" });
    }

    // 1. Fetch latest price
    const latestPrice = await prisma.adminPrice.findFirst({
      orderBy: { updated_at: "desc" },
    });

    if (!latestPrice) {
      return res.status(500).json({ message: "Current prices unavailable" });
    }

    let sip;
    let goldQty;
    await prisma.$transaction(async (tx) => {
      let metalType;

      // 2. Fetch SIP & Validate
      if (sip_type === "FIXED") {
        sip = await tx.fixedSip.findUnique({
          where: { id: sip_id },
          include: { sipPlanAdmin: true }
        });
        if (!sip) throw new Error("SIP not found");
        metalType = sip.sipPlanAdmin.metal_type;
      } else {
        sip = await tx.flexibleSip.findUnique({ where: { id: sip_id } });
        if (!sip) throw new Error("SIP not found");
        metalType = sip.metal_type;
      }
      const adminUser = await prisma.user.findUnique({ where: { id: userId } });
      if (!adminUser) throw new Error("User not found");
      if (adminUser.user_type !== "admin") throw new Error("Unauthorized");
      if (sip.status === "SETTLED") throw new Error("SIP_ALREADY_SETTLED");
      if (sip.status !== "COMPLETED") throw new Error("SIP_NOT_MATURE");
      // Check if already converted? Schema enum handles status, so if it is CONVERTED it won't be COMPLETED.

      const currentPrice = Number(latestPrice[metalType]);
      if (!currentPrice) throw new Error("Price not found for metal");

      // 3. Calculate Gold Quantity to credit
      // user has total_amount_paid. We buy gold at current rate.
      goldQty = Number(sip.total_amount_paid) / currentPrice;

      // 4. Update SIP status
      if (sip_type === "FIXED") {
        await tx.fixedSip.update({
          where: { id: sip_id },
          data: { status: "SETTLED" }
        });
      } else {
        await tx.flexibleSip.update({
          where: { id: sip_id },
          data: { status: "SETTLED" }
        });
      }
    });

    await prisma.notification.create({
      data: {
        user_id: sip.user_id,
        title: "SIP Settled",
        message: (sip_type === "FIXED") ?
          `SIP ${sip_id} Settled. Plan: ${sip.sipPlanAdmin.Yojna_name}, Metal: ${sip.sipPlanAdmin.metal_type}, Paid: ${sip.total_amount_paid}, Status: SETTLED, Gold: ${goldQty}`
          :
          `SIP ${sip_id} Settled. Metal: ${sip.metal_type}, Paid: ${sip.total_amount_paid}, Status: SETTLED, Gold: ${goldQty}`,
        type: "SIP",
      },
    });
    res.status(200).json({ message: "SIP Settled successfully" });

  } catch (err) {
    if (err.message === "SIP_ALREADY_SETTLED") {
      return res.status(200).json({ message: "SIP is already settled" });
    }
    if (err.message === "SIP_NOT_MATURE") {
      return res.status(200).json({ message: "SIP is not mature yet" });
    }
    // Check if headers are already sent to avoid crashing
    if (!res.headersSent) {
      console.error(err);
      res.status(500).json({ message: err.message });
    }
  }
};

export const getAllUsersCompletedAndSettledSips = async (req, res) => {
  try {
    const [sipsFixed, sipsFlexible] = await Promise.all([
      prisma.fixedSip.findMany({
        where: { status: { in: ["SETTLED", "COMPLETED"] } },
        include: { sipPlanAdmin: true },
        orderBy: { created_at: "desc" },
      }),
      prisma.flexibleSip.findMany({
        where: { status: { in: ["SETTLED", "COMPLETED"] } },
        orderBy: { created_at: "desc" },
      }),
    ]);

    res.json({ sipsFixed, sipsFlexible });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};