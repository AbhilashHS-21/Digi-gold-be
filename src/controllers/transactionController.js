import prisma from "../config/db.js";
import { addMonths, addMinutes } from "date-fns";
import { sendEmail } from "../utils/emailService.js";

export const sellGold = async (req, res) => {
  try {
    const userId = req.user.id;
    const { metal_type, quantity, utr_no, transaction_type } = req.body;
    console.log(userId, metal_type, quantity);

    if (!quantity || quantity <= 0) {
      return res.status(400).json({ message: "Invalid quantity" });
    }

    // 1. Fetch latest price
    const latestPrice = await prisma.adminPrice.findFirst({
      orderBy: { updated_at: "desc" },
    });

    if (!latestPrice) {
      return res.status(500).json({ message: "Current prices unavailable" });
    }

    const currentPrice = latestPrice[metal_type];
    if (!currentPrice) {
      return res.status(400).json({ message: "Invalid metal type" });
    }

    // 2. Transaction for atomicity
    const result = await prisma.$transaction(async (tx) => {
      // Check holdings
      const holding = await tx.holding.findFirst({
        where: {
          user_id: userId,
          metal_type: metal_type,
        },
      });
      console.log(holding);

      if (!holding || Number(holding.qty) < Number(quantity)) {
        throw new Error("Insufficient holdings");
      }

      // Calculate credit amount
      const creditAmount = Number(currentPrice) * Number(quantity);

      // Debit Holdings
      await tx.holding.update({
        where: { id: holding.id },
        data: {
          qty: { decrement: quantity },
          amt: { decrement: (Number(holding.amt) / Number(holding.qty)) * Number(quantity) }, // Proportional reduction
        },
      });

      // Create Credit Transaction
      const transaction = await tx.transaction.create({
        data: {
          user_id: userId,
          transaction_amt: creditAmount,
          transaction_type: transaction_type, // Or a specific type if needed
          transaction_status: "SUCCESS",
          category: "CREDIT",
          utr_no: utr_no, // Generate a unique ref
        },
      });

      return transaction;
    });

    res.status(200).json({ message: "Sell successful", transaction: result });
  } catch (err) {
    console.error(err);
    if (err.message === "Insufficient holdings") {
      return res.status(400).json({ message: "Insufficient holdings" });
    }
    res.status(500).json({ message: "Sell failed", error: err.message });
  }
};

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
        category: "CREDIT",
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

    if (transaction_type === "OFFLINE") {
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const otp_expires_at = addMinutes(new Date(), 15);

      // Find Admin
      const admin = await prisma.user.findFirst({
        where: { user_type: "admin" },
      });

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true }
      });

      if (!admin || !admin.email) {
        return res.status(500).json({ message: "Admin contact not found" });
      }

      // Send OTP to Admin
      await sendEmail(
        admin.email,
        "Offline Payment OTP Verification",
        `User ${user.username} requested offline payment of ${amount}. OTP: ${otp}`,
        `<p>User <strong>${user.username}</strong> requested offline payment of <strong>${amount}</strong>.</p><h3>OTP: ${otp}</h3>`
      );

      await prisma.notification.create({
        data: {
          user_id: admin.id,
          title: "Offline Payment OTP Verification",
          message: `User ${user.username} requested offline payment of ${amount}. OTP: ${otp}`,
          type: "OTP",
        },
      });

      const NewTransaction = await prisma.transaction.create({
        data: {
          user_id: userId,
          transaction_amt: amount,
          transaction_type,
          utr_no,
          transaction_status: "PENDING",
          category: category || "CREDIT",
          otp,
          otp_expires_at,
        },
      });

      return res.status(201).json({
        message: "Offline payment initiated. Ask Admin for OTP.",
        tr_id: NewTransaction.tr_id,
      });
    }

    const NewTransaction = await prisma.transaction.create({
      data: {
        user_id: userId,
        transaction_amt: amount,
        transaction_type,
        utr_no,
        transaction_status: "SUCCESS",
        category: category || "CREDIT",
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

export const verifyOfflineTransaction = async (req, res) => {
  try {
    const { tr_id, otp } = req.body;

    const transaction = await prisma.transaction.findUnique({
      where: { tr_id },
    });

    if (!transaction) {
      return res.status(404).json({ message: "Transaction not found" });
    }

    if (transaction.transaction_type !== "OFFLINE") {
      return res.status(400).json({ message: "Not an offline transaction" });
    }

    if (transaction.transaction_status === "SUCCESS") {
      return res.status(400).json({ message: "Transaction already verified" });
    }

    if (transaction.otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    if (new Date() > new Date(transaction.otp_expires_at)) {
      return res.status(400).json({ message: "OTP expired" });
    }

    const updatedTransaction = await prisma.transaction.update({
      where: { tr_id },
      data: {
        transaction_status: "SUCCESS",
        otp: null, // Clear OTP after usage for security
        otp_expires_at: null
      },
    });

    res.status(200).json({
      message: "Offline transaction verified successfully",
      transaction: updatedTransaction,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};
