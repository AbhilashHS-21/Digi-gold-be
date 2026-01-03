import prisma from "../config/db.js";
import { addMonths, addMinutes } from "date-fns";
import { sendEmail } from "../utils/emailService.js";
import { processOnlineTransaction } from "../services/transactionService.js";

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
    const { amount, utr_no, transaction_type, category, sip_id, sip_type, metal_type } = req.body;

    // 1️ IDENTIFY INTENT
    const isSip = !!sip_id;
    // Strict separation: Gold Buy only if metal_type exists AND it's NOT a SIP
    const isGoldBuy = !!metal_type && !isSip;
    const isOffline = transaction_type === "OFFLINE";

    // 2️ COMMON: OFFLINE PRE-CHECK (OTP Generation)
    // If offline, we just create a PENDING transaction and send OTP. 
    // We do NOT update SIP or Holdings yet.
    if (isOffline) {
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const otp_expires_at = addMinutes(new Date(), 15);

      const admin = await prisma.user.findFirst({ where: { user_type: "admin" } });
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, username: true } });

      if (!admin || !admin.email) return res.status(500).json({ message: "Admin contact not found" });
      console.log(sip_id);

      // Calculate execution_qty if Gold Buy (Locking price at booking?? Or just storing intent?)
      // Let's current price lock for fairness if they pay immediately via offline method (e.g. UPI).
      let execution_qty = null;
      if (isGoldBuy) {
        const latestPrice = await prisma.adminPrice.findFirst({ orderBy: { updated_at: "desc" } });
        console.log(latestPrice);
        if (!latestPrice || !latestPrice[metal_type]) return res.status(400).json({ message: "Price unavailable" });
        execution_qty = Number(amount) / Number(latestPrice[metal_type]);
      }

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

      const newTx = await prisma.transaction.create({
        data: {
          user_id: userId,
          transaction_amt: amount,
          transaction_type: "OFFLINE",
          utr_no: `OFFLINE-${userId}-${Date.now()}`,
          transaction_status: "PENDING",
          category: category || "CREDIT",
          otp,
          otp_expires_at,
          sip_id: isSip ? sip_id : null,
          sip_type: isSip ? sip_type : null,
          metal_type: isSip ? null : metal_type, // Strict validation
          execution_qty: isSip ? null : execution_qty,
        },
      });
      console.log(newTx);

      return res.status(201).json({ message: "Offline payment initiated. Ask Admin for OTP.", tr_id: newTx.tr_id });
    }

    // 3️⃣ ONLINE PROCESSING (Immediate)
    // Use the shared service for processing online transactions
    if (!isSip && !isGoldBuy) {
      throw new Error("Invalid transaction intent");
    }
    console.log("Online transaction processing...");
    const result = await processOnlineTransaction({
      userId,
      amount,
      utr_no,
      sip_id,
      sip_type,
      metal_type,
      category,
      transaction_type: transaction_type || "ONLINE"
    });
    console.log(result);
    return res.status(201).json({ message: "Transaction successful", ...result });

    // Note: The original large transaction block has been moved to services/transactionService.js
    // to allow reuse by Razorpay webhook/verification flow.

    res.status(201).json({ message: "Transaction successful", ...result });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
}

export const verifyOfflineTransaction = async (req, res) => {
  try {
    const { tr_id, otp } = req.body;

    const transaction = await prisma.transaction.findUnique({ where: { tr_id } });
    console.log("Transaction found:===================");
    console.log(transaction);
    if (!transaction) return res.status(404).json({ message: "Transaction not found" });
    if (transaction.transaction_type !== "OFFLINE") return res.status(400).json({ message: "Not an offline transaction" });
    if (transaction.transaction_status === "SUCCESS") return res.status(400).json({ message: "Transaction already verified" });
    if (transaction.otp !== otp) return res.status(400).json({ message: "Invalid OTP" });
    if (new Date() > new Date(transaction.otp_expires_at)) return res.status(400).json({ message: "OTP expired" });

    // EXECUTE DEFERRED LOGIC
    const result = await prisma.$transaction(async (tx) => {
      let resultData = {};

      // A. SIP
      if (transaction.sip_id) {
        const { sip_id, sip_type, transaction_amt } = transaction;
        let sip;
        if (sip_type === "FIXED") {
          console.log(sip_id);
          sip = await tx.fixedSip.findUnique({ where: { id: sip_id }, include: { sipPlanAdmin: true } });
          console.log(sip);
          if (sip) {
            const newMonths = sip.months_paid + 1;
            const newTotal = Number(sip.total_amount_paid) + Number(transaction_amt);
            const isComp = newMonths >= sip.sipPlanAdmin.total_months;
            const isDelayed = sip.has_delayed_payment || new Date() > new Date(sip.next_due_date);

            const updatedSip = await tx.fixedSip.update({
              where: { id: sip_id },
              data: {
                months_paid: newMonths,
                total_amount_paid: newTotal,
                status: isComp ? "COMPLETED" : "ACTIVE",
                has_delayed_payment: isDelayed
              }
            });
            console.log(updatedSip);

            // Notify Admin for 12th month bonus
            if (newMonths === 11 && sip.sipPlanAdmin.total_months === 12) {
              const admin = await tx.user.findFirst({ where: { user_type: "admin" } });
              if (admin) {
                await tx.notification.create({
                  data: {
                    user_id: admin.id,
                    title: "SIP Bonus Payment Due",
                    message: `User ${transaction.user_id} has completed 11 months of Fixed SIP ${sip_id}. Please pay the 12th month bonus. User Delayed Payment: ${isDelayed ? "Yes" : "No"}`,
                    type: "SIP_BONUS",
                  },
                });
              }
            }
          }
        } else {
          sip = await tx.flexibleSip.findUnique({ where: { id: sip_id } });
          if (sip) {
            const newMonths = sip.months_paid + 1;
            const newTotal = Number(sip.total_amount_paid) + Number(transaction_amt);
            const isComp = newMonths >= sip.total_months;
            await tx.flexibleSip.update({
              where: { id: sip_id },
              data: { months_paid: newMonths, total_amount_paid: newTotal, status: isComp ? "COMPLETED" : "ACTIVE" }
            });
          }
        }
      }
      // B. GOLD BUY
      else if (transaction.metal_type) {
        const { metal_type, transaction_amt, execution_qty, user_id } = transaction;
        // Use execution_qty if available (fairness), else recalc?
        // We stored it, so let's use it.
        // If null (legacy?), recalc.
        let qty = execution_qty;
        if (!qty) {
          const latestPrice = await tx.adminPrice.findFirst({ orderBy: { updated_at: "desc" } });
          qty = Number(transaction_amt) / Number(latestPrice[metal_type]);
        }

        const existing = await tx.holding.findFirst({ where: { user_id, metal_type } });
        if (existing) {
          await tx.holding.update({
            where: { id: existing.id },
            data: { amt: { increment: transaction_amt }, qty: { increment: qty }, updated_at: new Date() }
          });
        } else {
          await tx.holding.create({
            data: { user_id, metal_type, amt: transaction_amt, qty }
          });
        }
      }

      const updatedTx = await tx.transaction.update({
        where: { tr_id },
        data: { transaction_status: "SUCCESS", otp: null, otp_expires_at: null },
      });

      return updatedTx;
    });
    console.log("Offline transaction verified successfully");
    console.log("=============", result);

    res.status(200).json({ message: "Offline transaction verified successfully", transaction: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};
