import cron from "node-cron";
import prisma from "../config/db.js";

const processSipMaturity = async () => {
    console.log("Running SIP Maturity Check...");
    try {
        const today = new Date();

        // Find Active Fixed SIPs with 11 months paid and due date passed or today
        const fixedSips = await prisma.fixedSip.findMany({
            where: {
                status: "ACTIVE",
                months_paid: 11,
                next_due_date: {
                    lte: today
                }
            },
            include: { sipPlanAdmin: true }
        });

        for (const sip of fixedSips) {
            // Check if plan is 12 months
            if (sip.sipPlanAdmin.total_months !== 12) continue;

            // Calculate 12th month amount (Average of 11 months)
            const bonusAmount = Number(sip.total_amount_paid) / 11;

            await prisma.$transaction(async (tx) => {
                // 1. Create CREDIT transaction for the bonus
                await tx.transaction.create({
                    data: {
                        user_id: sip.user_id,
                        transaction_amt: bonusAmount,
                        transaction_type: "SIP_BONUS",
                        category: "CREDIT",
                        transaction_status: "SUCCESS",
                        sip_id: sip.id,
                        sip_type: "FIXED",
                        utr_no: `BONUS-${sip.id}-${Date.now()}` // Unique ref
                    }
                });

                // 2. Update SIP to COMPLETED
                await tx.fixedSip.update({
                    where: { id: sip.id },
                    data: {
                        months_paid: 12,
                        total_amount_paid: { increment: bonusAmount },
                        status: "COMPLETED",
                        next_due_date: null
                    }
                });
            });
            console.log(`Processed Maturity for SIP: ${sip.id}`);
        }

        // Similar logic for Flexible SIPs if they have 12 month tenure?
        // FlexibleSip schema has total_months default 12.
        const flexibleSips = await prisma.flexibleSip.findMany({
            where: {
                status: "ACTIVE",
                months_paid: 11,
                total_months: 12,
                next_due_date: { lte: today },
            }
        });

        for (const sip of flexibleSips) {
            const bonusAmount = Number(sip.total_amount_paid) / 11;

            await prisma.$transaction(async (tx) => {
                await tx.transaction.create({
                    data: {
                        user_id: sip.user_id,
                        transaction_amt: bonusAmount,
                        transaction_type: "SIP_BONUS",
                        category: "CREDIT",
                        transaction_status: "SUCCESS",
                        sip_id: sip.id,
                        sip_type: "FLEXIBLE",
                        utr_no: `BONUS-${sip.id}-${Date.now()}`
                    }
                });

                await tx.flexibleSip.update({
                    where: { id: sip.id },
                    data: {
                        months_paid: 12,
                        total_amount_paid: { increment: bonusAmount },
                        status: "COMPLETED",
                        next_due_date: null
                    }
                });
            });
            console.log(`Processed Maturity for Flexible SIP: ${sip.id}`);
        }

    } catch (err) {
        console.error("Error in SIP Maturity Job:", err);
    }
};

// Run every day at mightnight
const startSipScheduler = () => {
    cron.schedule("0 0 * * *", processSipMaturity);
    console.log("SIP Scheduler started.");
};

export { startSipScheduler, processSipMaturity };
