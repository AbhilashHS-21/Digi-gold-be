const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('Verifying data counts...');

    const counts = {
        User: await prisma.user.count(),
        PanDetail: await prisma.panDetail.count(),
        BankDetail: await prisma.bankDetail.count(),
        Holding: await prisma.holding.count(),
        Transaction: await prisma.transaction.count(),
        FixedSip: await prisma.fixedSip.count(),
        FlexibleSip: await prisma.flexibleSip.count(),
        Notification: await prisma.notification.count(),
        AdminPrice: await prisma.adminPrice.count(),
        SipPlanAdmin: await prisma.sipPlanAdmin.count(),
    };

    console.table(counts);
}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });
