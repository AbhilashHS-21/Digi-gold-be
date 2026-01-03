import prisma from "../config/db.js";
import { addMonths } from "date-fns";

/**
 * Process an online transaction (SIP Payment or Gold Buy).
 * Wraps everything in a transaction.
 * @param {Object} params
 * @param {string} params.userId
 * @param {number} params.amount
 * @param {string} params.utr_no
 * @param {string} [params.sip_id]
 * @param {string} [params.sip_type]
 * @param {string} [params.metal_type]
 * @param {string} [params.category]
 * @param {string} [params.transaction_type]
 * @returns {Promise<Object>}
 */
export const processOnlineTransaction = async ({
    userId,
    amount,
    utr_no,
    sip_id,
    sip_type,
    metal_type,
    category = "CREDIT",
    transaction_type = "ONLINE",
}) => {
    return await prisma.$transaction(async (tx) => {
        let resultData = {};

        // 1. Identify Intent
        const isSip = !!sip_id && !sip_id.startsWith("quick-buy-");
        const isGoldBuy = !!metal_type;

        // A. SIP PAYMENT
        if (isSip) {
            if (!["FIXED", "FLEXIBLE"].includes(sip_type)) {
                throw new Error("Invalid SIP type");
            }

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

            // Update SIP
            let updatedSip;
            if (sip_type === "FIXED") {
                const newMonthsPaid = sip.months_paid + 1;
                const newTotalAmount = Number(sip.total_amount_paid) + Number(amount);
                const totalMonths = sip.sipPlanAdmin.total_months;
                const isCompleted = newMonthsPaid >= totalMonths;
                const isDelayed = sip.has_delayed_payment || new Date() > new Date(sip.next_due_date);

                updatedSip = await tx.fixedSip.update({
                    where: { id: sip_id },
                    data: {
                        months_paid: newMonthsPaid,
                        total_amount_paid: newTotalAmount,
                        status: isCompleted ? "COMPLETED" : "ACTIVE",
                        next_due_date: isCompleted ? null : addMonths(new Date(), 1),
                        has_delayed_payment: isDelayed,
                    },
                });

                // Notify Admin for 12th month bonus
                if (newMonthsPaid === 11 && totalMonths === 12) {
                    const admin = await tx.user.findFirst({ where: { user_type: "admin" } });
                    if (admin) {
                        await tx.notification.create({
                            data: {
                                user_id: admin.id,
                                title: "SIP Bonus Payment Due",
                                message: `User ${userId} has completed 11 months of Fixed SIP ${sip_id}. Please pay the 12th month bonus. User Delayed Payment: ${isDelayed ? "Yes" : "No"}`,
                                type: "SIP_BONUS",
                            },
                        });
                    }
                }
            } else {
                // Flexible SIP
                const newMonthsPaid = sip.months_paid + 1;
                const newTotalAmount = Number(sip.total_amount_paid) + Number(amount);
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
            resultData.updatedSip = updatedSip;
        }

        // B. GOLD BUY (HOLDINGS)
        else if (isGoldBuy) {
            const latestPrice = await tx.adminPrice.findFirst({
                orderBy: { updated_at: "desc" },
            });
            if (!latestPrice || !latestPrice[metal_type]) {
                throw new Error("Price unavailable");
            }

            const qty = Number(amount) / Number(latestPrice[metal_type]); // Calculate Qty

            // Upsert Holding
            const existing = await tx.holding.findFirst({
                where: { user_id: userId, metal_type },
            });

            let updatedHolding;
            if (existing) {
                updatedHolding = await tx.holding.update({
                    where: { id: existing.id },
                    data: {
                        amt: { increment: amount },
                        qty: { increment: qty },
                        updated_at: new Date(),
                    },
                });
            } else {
                updatedHolding = await tx.holding.create({
                    data: {
                        user_id: userId,
                        metal_type,
                        amt: amount,
                        qty: qty,
                    },
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
                transaction_type: transaction_type,
                utr_no,
                transaction_status: "SUCCESS",
                category: category,
                sip_id: isSip ? sip_id : null,
                sip_type: isSip ? sip_type : null,
                metal_type: isSip ? null : metal_type, // Ignore metal type if SIP
                execution_qty: resultData.execution_qty || null,
            },
        });
        resultData.transaction = newTx;

        return resultData;
    });
};
