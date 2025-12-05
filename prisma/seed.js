const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Helper to get random element from array
const randomElement = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Helper to get random number between min and max
const randomNumber = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// Helper to get random decimal
const randomDecimal = (min, max, precision = 2) => {
    const val = Math.random() * (max - min) + min;
    return parseFloat(val.toFixed(precision));
};

async function main() {
    console.log('Start seeding ...');

    // 1. Admin Price
    await prisma.adminPrice.create({
        data: {
            gold24K: 7200.50,
            gold22K: 6800.00,
            silver: 90.00,
        },
    });
    console.log('Created AdminPrice');

    // 2. Sip Plans
    const sipPlans = [];
    const metals = ['gold24K', 'gold22K', 'silver'];

    for (const metal of metals) {
        const plan = await prisma.sipPlanAdmin.create({
            data: {
                Yojna_name: `${metal.toUpperCase()} Saver Plan`,
                metal_type: metal,
                range_amount: 1000,
                total_months: 12,
            },
        });
        sipPlans.push(plan);
    }
    console.log('Created SipPlanAdmin');

    // 3. Users
    const users = [];
    // Create 1 Admin
    const admin = await prisma.user.create({
        data: {
            username: 'admin_user',
            email: 'admin@example.com',
            password_hash: '$2b$10$yMdEuYo64GPVcJ59jTn6VOY8FrWk7w0JYCNTUwmbZgOmQr//QaLuG', // user
            first_name: 'Admin',
            last_name: 'User',
            user_type: 'admin',
            is_verified: true,
        },
    });
    users.push(admin);

    // Create 5 Customers
    for (let i = 1; i <= 5; i++) {
        const user = await prisma.user.create({
            data: {
                username: `user_${i}`,
                email: `user${i}@example.com`,
                password_hash: '$2b$10$yMdEuYo64GPVcJ59jTn6VOY8FrWk7w0JYCNTUwmbZgOmQr//QaLuG', //user
                first_name: `FirstName${i}`,
                last_name: `LastName${i}`,
                phone: `987654321${i}`,
                user_type: 'customer',
                gender: i % 2 === 0 ? 'MALE' : 'FEMALE',
                is_verified: i % 2 === 0, // Mix of verified/unverified
                current_holdings: randomDecimal(0, 10000),
            },
        });
        users.push(user);
    }
    console.log('Created Users');

    // 4. Related Data for Customers
    for (const user of users) {
        if (user.user_type === 'admin') continue;

        // Pan Details
        await prisma.panDetail.create({
            data: {
                user_id: user.id,
                full_name: `${user.first_name} ${user.last_name}`,
                pan_number: `ABCDE123${randomNumber(0, 9)}F`,
                status: randomElement(['APPROVED', 'PENDING', 'REJECTED']),
            },
        });

        // Bank Details
        await prisma.bankDetail.create({
            data: {
                user_id: user.id,
                full_name: `${user.first_name} ${user.last_name}`,
                account_no: `1234567890${randomNumber(0, 9)}`,
                bank_name: 'Mock Bank',
                ifsc_code: 'MOCK0001234',
                status: randomElement(['APPROVED', 'PENDING', 'REJECTED']),
            },
        });

        // Holdings
        for (const metal of metals) {
            await prisma.holding.create({
                data: {
                    user_id: user.id,
                    metal_type: metal,
                    amt: randomDecimal(100, 5000),
                    qty: randomDecimal(0.1, 5, 3),
                },
            });
        }

        // Transactions
        for (let j = 0; j < 3; j++) {
            await prisma.transaction.create({
                data: {
                    user_id: user.id,
                    transaction_amt: randomDecimal(100, 1000),
                    transaction_type: randomElement(['ONLINE', 'OFFLINE', 'SIP']),
                    utr_no: `UTR${Date.now()}${randomNumber(100, 999)}`,
                    transaction_status: 'SUCCESS',
                    category: randomElement(['CREDIT', 'DEBIT']),
                },
            });
        }

        // Fixed SIPs
        await prisma.fixedSip.create({
            data: {
                user_id: user.id,
                sip_plan_id: randomElement(sipPlans).id,
                total_amount_paid: randomDecimal(1000, 5000),
                months_paid: randomNumber(1, 5),
                status: 'ACTIVE',
            },
        });

        // Flexible SIPs
        await prisma.flexibleSip.create({
            data: {
                user_id: user.id,
                total_amount_paid: randomDecimal(500, 2000),
                metal_type: randomElement(metals),
                months_paid: randomNumber(1, 3),
                status: 'ACTIVE',
            },
        });

        // Notifications
        await prisma.notification.create({
            data: {
                user_id: user.id,
                title: 'Welcome',
                message: 'Welcome to Digi Gold!',
                type: 'INFO',
            },
        });
    }
    console.log('Created Related Data');

    console.log('Seeding finished.');
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
