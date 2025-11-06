import prisma from "../config/db.js";
import { addMonths } from "date-fns";

// SIP payments
export const paySipInstallment = async (req, res) => {
  try {
    const userId = req.user.id;
    const { sip_type, sip_id, amount, utr_no } = req.body;

    if (!["FIXED", "FLEXIBLE"].includes(sip_type)) {
      return res.status(400).json({ message: "Invalid SIP type" });
    }

    // 1️⃣ Fetch SIP details
    let sip;
    if (sip_type === "FIXED") {
      sip = await prisma.fixedSip.findUnique({
        where: { id: sip_id },
        include: { sipPlanAdmin: true },
      });
    } else {
      sip = await prisma.flexibleSip.findUnique({
        where: { id: sip_id },
      });
    }

    if (!sip || sip.user_id !== userId) {
      return res.status(404).json({ message: "SIP not found" });
    }

    if (sip.status === "COMPLETED") {
      return res.status(400).json({ message: "SIP already completed" });
    }

    // 2️⃣ Create a transaction record
    const transaction = await prisma.transaction.create({
      data: {
        user_id: userId,
        transaction_amt: amount,
        transaction_type: "SIP",
        utr_no,
        sip_id,
        sip_type,
        transaction_status: "SUCCESS",
      },
    });

    // 3️⃣ Update SIP progress
    let updatedSip;
    if (sip_type === "FIXED") {
      const newMonthsPaid = sip.months_paid + 1;
      const newTotalAmount = sip.total_amount_paid + amount;
      const totalMonths = sip.sipPlanAdmin.total_months;
      const isCompleted = newMonthsPaid >= totalMonths;

      updatedSip = await prisma.fixedSip.update({
        where: { id: sip_id },
        data: {
          months_paid: newMonthsPaid,
          total_amount_paid: newTotalAmount,
          status: isCompleted ? "COMPLETED" : "ACTIVE",
          next_due_date: isCompleted ? null : addMonths(new Date(), 1),
        },
        include: { sipPlanAdmin: true },
      });
    } else {
      const newMonthsPaid = sip.months_paid + 1;
      const newTotalAmount = sip.total_amount_paid + amount;
      const isCompleted = newMonthsPaid >= sip.total_months;

      updatedSip = await prisma.flexibleSip.update({
        where: { id: sip_id },
        data: {
          months_paid: newMonthsPaid,
          total_amount_paid: newTotalAmount,
          status: isCompleted ? "COMPLETED" : "ACTIVE",
          next_due_date: isCompleted ? null : addMonths(new Date(), 1),
        },
      });
    }

    res.status(201).json({
      message: "SIP payment successful",
      transaction,
      updatedSip,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

export const getSipTransactions = async (req, res) => {
  try {
    const userId = req.user.id;

    const sipTransactions = await prisma.transactions.findMany({
      where: {
        user_id: userId,
        transaction_type: "SIP",
      },
      orderBy: { transaction_datetime: "desc" },
    });

    res.json({ sipTransactions });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
