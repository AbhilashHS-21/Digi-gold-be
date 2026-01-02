// controllers/transactionController.js
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
      sip = await tx.fixedSip.findUnique({
        where: { id: sip_id },
        include: { sipPlanAdmin: true },
      });
    } else {
      sip = await tx.flexibleSip.findUnique({ where: { id: sip_id } });
    }

    if (!sip || sip.user_id !== userId) {
      throw new Error("SIP not found or not authorized");
    }

    if (sip.status === "COMPLETED") {
      throw new Error("SIP already completed");
    }

    // 2️⃣ Create transaction (initially as PENDING)
    const transaction = await tx.transaction.create({
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

        updatedSip = await tx.fixedSip.update({
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

        updatedSip = await tx.flexibleSip.update({
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
      const successTx = await tx.transaction.update({
        where: { tr_id: transaction.tr_id },
        data: { transaction_status: "SUCCESS" },
      });

      return { transaction: successTx, updatedSip };
    } catch (err) {
      // 5️⃣ Mark transaction as FAILED
      await tx.transaction.update({
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
    const isGoldBuy = !!metal_type;
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
          sip_id,
          sip_type,
          metal_type: metal_type || null,
          execution_qty, // Store calculated qty
        },
      });

      return res.status(201).json({ message: "Offline payment initiated. Ask Admin for OTP.", tr_id: newTx.tr_id });
    }

    // 3️ ONLINE PROCESSING (Immediate)
    const result = await prisma.$transaction(async (tx) => {
      let resultData = {};

      // A. SIP PAYMENT
      if (isSip) {
        if (!["FIXED", "FLEXIBLE"].includes(sip_type)) throw new Error("Invalid SIP type");

        let sip;
        if (sip_type === "FIXED") {
          sip = await tx.fixedSip.findUnique({ where: { id: sip_id }, include: { sipPlanAdmin: true } });
        } else {
          sip = await tx.flexibleSip.findUnique({ where: { id: sip_id } });
        }

        if (!sip || sip.user_id !== userId) throw new Error("SIP not found or unauthorized");
        if (sip.status === "COMPLETED") throw new Error("SIP already completed");

        // Update SIP
        let updatedSip;
        if (sip_type === "FIXED") {
          const newMonthsPaid = sip.months_paid + 1;
          const newTotalAmount = Number(sip.total_amount_paid) + Number(amount);
          const totalMonths = sip.sipPlanAdmin.total_months;
          updatedSip = await tx.fixedSip.update({
            where: { id: sip_id },
            data: {
              months_paid: newMonthsPaid,
              total_amount_paid: newTotalAmount,
              status: newMonthsPaid >= totalMonths ? "COMPLETED" : "ACTIVE",
              next_due_date: newMonthsPaid >= totalMonths ? null : addMonths(new Date(), 1),
              has_delayed_payment: sip.has_delayed_payment || new Date() > new Date(sip.next_due_date),
            },
          });

          // Notify Admin for 12th month bonus
          if (newMonthsPaid === 11 && totalMonths === 12) {
            const admin = await tx.user.findFirst({ where: { user_type: "admin" } });
            if (admin) {
              const hasDelayed = updatedSip.has_delayed_payment;
              await tx.notification.create({
                data: {
                  user_id: admin.id,
                  title: "SIP Bonus Payment Due",
                  message: `User ${userId} has completed 11 months of Fixed SIP ${sip_id}. Please pay the 12th month bonus. User Delayed Payment: ${hasDelayed ? "Yes" : "No"}`,
                  type: "SIP_BONUS",
                },
              });
            }
          }
        } else {
          const newMonthsPaid = sip.months_paid + 1;
          const newTotalAmount = Number(sip.total_amount_paid) + Number(amount);
          updatedSip = await tx.flexibleSip.update({
            where: { id: sip_id },
            data: {
              months_paid: newMonthsPaid,
              total_amount_paid: newTotalAmount,
              status: newMonthsPaid >= sip.total_months ? "COMPLETED" : "ACTIVE",
              next_due_date: newMonthsPaid >= sip.total_months ? null : addMonths(new Date(), 1),
            },
          });
        }
        resultData.updatedSip = updatedSip;
      }

      // B. GOLD BUY (HOLDINGS)
      else if (isGoldBuy) {
        const latestPrice = await tx.adminPrice.findFirst({ orderBy: { updated_at: "desc" } });
        if (!latestPrice || !latestPrice[metal_type]) throw new Error("Price unavailable");

        const qty = Number(amount) / Number(latestPrice[metal_type]); // Calculate Qty

        // Upsert Holding
        const existing = await tx.holding.findFirst({ where: { user_id: userId, metal_type } });
        let updatedHolding;
        if (existing) {
          updatedHolding = await tx.holding.update({
            where: { id: existing.id },
            data: { amt: { increment: amount }, qty: { increment: qty }, updated_at: new Date() }
          });
        } else {
          updatedHolding = await tx.holding.create({
            data: { user_id: userId, metal_type, amt: amount, qty: qty }
          });
        }
        resultData.updatedHolding = updatedHolding;
        resultData.execution_qty = qty;
      }

      // Create Success Transaction
      const newTx = await tx.transaction.create({
        data: {
          user_id: userId,
          transaction_amt: amount,
          transaction_type: transaction_type || "ONLINE", // SIP or ONLINE
          utr_no,
          transaction_status: "SUCCESS",
          category: category || "CREDIT",
          sip_id: sip_id || null,
          sip_type: sip_type || null,
          metal_type: metal_type || null,
          execution_qty: resultData.execution_qty || null
        },
      });
      resultData.transaction = newTx;

      return resultData;
    });

    res.status(201).json({ message: "Transaction successful", ...result });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

export const verifyOfflineTransaction = async (req, res) => {
  try {
    const { tr_id, otp } = req.body;

    const transaction = await prisma.transaction.findUnique({ where: { tr_id } });
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
          sip = await tx.fixedSip.findUnique({ where: { id: sip_id }, include: { sipPlanAdmin: true } });
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

    res.status(200).json({ message: "Offline transaction verified successfully", transaction: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

// Add the missing functions for createTransaction and buyMetal
export const createTransaction = async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      amount, 
      utr_no, 
      transaction_type = "ONLINE", 
      category = "CREDIT", 
      sip_id, 
      sip_type, 
      metal_type,
      grams 
    } = req.body;

    // Check market status
    if (!req.isMarketOpen) {
      return res.status(403).json({
        success: false,
        message: `Market is closed. Trading hours: ${req.marketOpenTime || '10:00'} to ${req.marketCloseTime || '18:00'}`
      });
    }

    // Validate required fields
    if (!amount || amount <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid amount" 
      });
    }

    // Handle different transaction types
    let result;
    if (metal_type && grams) {
      // Gold/Silver purchase
      result = await handleMetalPurchase(userId, amount, metal_type, grams, transaction_type, utr_no);
    } else if (sip_id && sip_type) {
      // SIP payment
      result = await handleSipPayment(userId, amount, sip_id, sip_type, transaction_type, utr_no);
    } else {
      // General transaction
      result = await handleGeneralTransaction(userId, amount, transaction_type, utr_no, category);
    }

    res.status(201).json({
      success: true,
      message: "Transaction created successfully",
      data: result
    });

  } catch (error) {
    console.error('Error creating transaction:', error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to create transaction"
    });
  }
};

export const buyMetal = async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      metal_type, 
      amount, 
      grams,
      transaction_type = "ONLINE",
      utr_no 
    } = req.body;

    // Check market status
    if (!req.isMarketOpen) {
      return res.status(403).json({
        success: false,
        message: `Market is closed. Trading hours: ${req.marketOpenTime || '10:00'} to ${req.marketCloseTime || '18:00'}`
      });
    }

    // Validate required fields
    if (!metal_type || !amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Metal type and amount are required"
      });
    }

    // Calculate grams if not provided
    let calculatedGrams = grams;
    if (!calculatedGrams) {
      const latestPrice = await prisma.adminPrice.findFirst({
        orderBy: { updated_at: "desc" },
      });

      if (!latestPrice || !latestPrice[metal_type]) {
        return res.status(400).json({
          success: false,
          message: "Current price not available for this metal"
        });
      }

      calculatedGrams = (amount / Number(latestPrice[metal_type])).toFixed(4);
    }

    // Create transaction
    const result = await handleMetalPurchase(
      userId, 
      amount, 
      metal_type, 
      calculatedGrams, 
      transaction_type, 
      utr_no
    );

    res.status(201).json({
      success: true,
      message: "Metal purchase successful",
      data: result
    });

  } catch (error) {
    console.error('Error buying metal:', error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to buy metal"
    });
  }
};

// Helper functions
const handleMetalPurchase = async (userId, amount, metal_type, grams, transaction_type, utr_no) => {
  return await prisma.$transaction(async (tx) => {
    // Get latest price
    const latestPrice = await tx.adminPrice.findFirst({
      orderBy: { updated_at: "desc" },
    });

    if (!latestPrice || !latestPrice[metal_type]) {
      throw new Error("Current price not available");
    }

    const price = Number(latestPrice[metal_type]);
    const calculatedGrams = grams || (amount / price).toFixed(4);

    // Create transaction record
    const transaction = await tx.transaction.create({
      data: {
        user_id: userId,
        transaction_amt: amount,
        transaction_type: transaction_type,
        utr_no: utr_no || `TX-${Date.now()}-${userId}`,
        transaction_status: "SUCCESS",
        category: "DEBIT",
        metal_type: metal_type,
        execution_qty: calculatedGrams,
      },
    });

    // Update or create holding
    const existingHolding = await tx.holding.findFirst({
      where: {
        user_id: userId,
        metal_type: metal_type,
      },
    });

    if (existingHolding) {
      await tx.holding.update({
        where: { id: existingHolding.id },
        data: {
          amt: { increment: amount },
          qty: { increment: calculatedGrams },
          updated_at: new Date(),
        },
      });
    } else {
      await tx.holding.create({
        data: {
          user_id: userId,
          metal_type: metal_type,
          amt: amount,
          qty: calculatedGrams,
        },
      });
    }

    // Update user's current holdings
    await tx.user.update({
      where: { id: userId },
      data: {
        current_holdings: { increment: amount },
        updated_at: new Date(),
      },
    });

    return {
      transaction,
      grams: calculatedGrams,
      price,
      totalAmount: amount,
    };
  });
};

const handleSipPayment = async (userId, amount, sip_id, sip_type, transaction_type, utr_no) => {
  return await prisma.$transaction(async (tx) => {
    // Validate SIP type
    if (!["FIXED", "FLEXIBLE"].includes(sip_type)) {
      throw new Error("Invalid SIP type");
    }

    // Get SIP details
    let sip;
    if (sip_type === "FIXED") {
      sip = await tx.fixedSip.findUnique({
        where: { id: sip_id },
        include: { sipPlanAdmin: true },
      });
    } else {
      sip = await tx.flexibleSip.findUnique({
        where: { id: sip_id },
      });
    }

    if (!sip || sip.user_id !== userId) {
      throw new Error("SIP not found or unauthorized");
    }

    if (sip.status === "COMPLETED") {
      throw new Error("SIP already completed");
    }

    // Create transaction
    const transaction = await tx.transaction.create({
      data: {
        user_id: userId,
        transaction_amt: amount,
        transaction_type: "SIP",
        utr_no: utr_no || `SIP-${Date.now()}-${userId}`,
        sip_id,
        sip_type,
        transaction_status: "SUCCESS",
        category: "CREDIT",
      },
    });

    // Update SIP
    let updatedSip;
    if (sip_type === "FIXED") {
      const newMonthsPaid = (sip.months_paid || 0) + 1;
      const newTotalAmount = (Number(sip.total_amount_paid) || 0) + Number(amount);
      const totalMonths = sip.sipPlanAdmin?.total_months || 12;
      const isCompleted = newMonthsPaid >= totalMonths;

      updatedSip = await tx.fixedSip.update({
        where: { id: sip_id },
        data: {
          months_paid: newMonthsPaid,
          total_amount_paid: newTotalAmount,
          status: isCompleted ? "COMPLETED" : "ACTIVE",
          next_due_date: isCompleted ? null : addMonths(new Date(), 1),
          has_delayed_payment: sip.has_delayed_payment || new Date() > new Date(sip.next_due_date),
        },
      });

      // Notify admin for 12th month bonus
      if (newMonthsPaid === 11 && totalMonths === 12) {
        const admin = await tx.user.findFirst({ where: { user_type: "admin" } });
        if (admin) {
          await tx.notification.create({
            data: {
              user_id: admin.id,
              title: "SIP Bonus Payment Due",
              message: `User ${userId} has completed 11 months of Fixed SIP ${sip_id}. Please pay the 12th month bonus.`,
              type: "SIP_BONUS",
            },
          });
        }
      }
    } else {
      const newMonthsPaid = (sip.months_paid || 0) + 1;
      const newTotalAmount = (Number(sip.total_amount_paid) || 0) + Number(amount);
      const totalMonths = sip.total_months || 12;
      const isCompleted = newMonthsPaid >= totalMonths;

      updatedSip = await tx.flexibleSip.update({
        where: { id: sip_id },
        data: {
          months_paid: newMonthsPaid,
          total_amount_paid: newTotalAmount,
          status: isCompleted ? "COMPLETED" : "ACTIVE",
          next_due_date: isCompleted ? null : addMonths(new Date(), 1),
        },
      });
    }

    return {
      transaction,
      updatedSip,
    };
  });
};

const handleGeneralTransaction = async (userId, amount, transaction_type, utr_no, category) => {
  const transaction = await prisma.transaction.create({
    data: {
      user_id: userId,
      transaction_amt: amount,
      transaction_type: transaction_type,
      utr_no: utr_no || `GEN-${Date.now()}-${userId}`,
      transaction_status: "SUCCESS",
      category: category,
    },
  });

  return { transaction };
};