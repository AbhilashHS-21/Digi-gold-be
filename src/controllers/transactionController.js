import prisma from "../config/db.js";
import { addMonths } from "date-fns";

// SIP payments
export const paySipInstallment = async (req, res) => {
  const userId = req.user.id;
  const { sip_type, sip_id, amount, utr_no } = req.body;

  if (!["FIXED", "FLEXIBLE"].includes(sip_type)) {
    return res.status(400).json({ message: "Invalid SIP type" });
  }

  // use prisma transaction for atomicity
  const prismaTx = prisma.$transaction(async (tx) => {
    // 1️⃣ Fetch SIP details
    let sip;
    if (sip_type === "FIXED") {
      sip = await tx.fixed_sips.findUnique({
        where: { id: sip_id },
        include: { sipPlanAdmin: true },
      });
    } else {
      sip = await tx.flexible_sips.findUnique({ where: { id: sip_id } });
    }

    if (!sip || sip.user_id !== userId) {
      throw new Error("SIP not found or not authorized");
    }

    if (sip.status === "COMPLETED") {
      throw new Error("SIP already completed");
    }

    // 2️⃣ Create transaction (initially as PENDING)
    const transaction = await tx.transactions.create({
      data: {
        user_id: userId,
        transaction_amt: amount,
        transaction_type: "SIP",
        utr_no,
        sip_id,
        sip_type,
        transaction_status: "PENDING",
        category: "DEBIT",
      },
    });

    try {
      // 3️⃣ Update SIP progress
      let updatedSip;
      if (sip_type === "FIXED") {
        const newMonthsPaid = sip.months_paid + 1;
        const newTotalAmount = sip.total_amount_paid + amount;
        const totalMonths = sip.sipPlanAdmin.total_months;
        const isCompleted = newMonthsPaid >= totalMonths;

        updatedSip = await tx.fixed_sips.update({
          where: { id: sip_id },
          data: {
            months_paid: newMonthsPaid,
            total_amount_paid: newTotalAmount,
            status: isCompleted ? "COMPLETED" : "ACTIVE",
            next_due_date: isCompleted ? null : addMonths(new Date(), 1),
          },
        });
      } else {
        const newMonthsPaid = sip.months_paid + 1;
        const newTotalAmount = sip.total_amount_paid + amount;
        const isCompleted = newMonthsPaid >= sip.total_months;

        updatedSip = await tx.flexible_sips.update({
          where: { id: sip_id },
          data: {
            months_paid: newMonthsPaid,
            total_amount_paid: newTotalAmount,
            status: isCompleted ? "COMPLETED" : "ACTIVE",
            next_due_date: isCompleted ? null : addMonths(new Date(), 1),
          },
        });
      }

      // 4️⃣ Mark transaction as SUCCESS
      const successTx = await tx.transactions.update({
        where: { tr_id: transaction.tr_id },
        data: { transaction_status: "SUCCESS" },
      });

      return { transaction: successTx, updatedSip };
    } catch (err) {
      // 5️⃣ Mark transaction as FAILED
      await tx.transactions.update({
        where: { tr_id: transaction.tr_id },
        data: { transaction_status: "FAILED" },
      });

      throw err; // rollback entire operation
    }
  });

  try {
    const result = await prismaTx;
    res.status(201).json({
      message: "SIP payment successful",
      transaction: result.transaction,
      updatedSip: result.updatedSip,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "SIP payment failed",
      error: err.message,
    });
  }
};

export const getSipTransactions = async (req, res) => {
  try {
    const userId = req.user.id;

    const sipTransactions = await prisma.transaction.findMany({
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

export const getAllTransactions = async (req, res) => {
  try {
    const userId = req.user.id;

    const sipTransactions = await prisma.transaction.findMany({
      where: {
        user_id: userId,
      },
      orderBy: { transaction_datetime: "desc" },
    });

    res.json({ sipTransactions });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const addTransaction = async (req, res) => {
  try {
    const userId = req.user.id;
    const { amount, utr_no, transaction_type, category } = req.body;

    const NewTransaction = await prisma.transaction.create({
      data: {
        user_id: userId,
        transaction_amt: amount,
        transaction_type,
        utr_no,
        transaction_status: "SUCCESS",
        category: category || "DEBIT",
      },
    });
    res.status(201).json({
      message: "Payment successful",
      NewTransaction
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
}
