import prisma from '../config/db.js';
import ExcelJS from 'exceljs';

export const exportData = async (req, res) => {
    try {
        const workbook = new ExcelJS.Workbook();

        // --- Sheet 1: Users ---
        const users = await prisma.user.findMany({
            include: {
                pan_details: true,
                bank_details: true,
            },
        });

        const userSheet = workbook.addWorksheet('Users');
        userSheet.columns = [
            { header: 'ID', key: 'id', width: 30 },
            { header: 'Username', key: 'username', width: 20 },
            { header: 'Email', key: 'email', width: 25 },
            { header: 'Name', key: 'name', width: 25 },
            { header: 'Phone', key: 'phone', width: 15 },
            { header: 'Type', key: 'user_type', width: 10 },
            { header: 'DoB', key: 'dob', width: 15 },
            { header: 'Status', key: 'status', width: 10 },
            { header: 'Created At', key: 'created_at', width: 20 },
            { header: 'PAN', key: 'pan', width: 15 },
            { header: 'Bank Account', key: 'bank_account', width: 20 },
        ];

        users.forEach((user) => {
            userSheet.addRow({
                id: user.id,
                username: user.username,
                email: user.email,
                name: `${user.first_name} ${user.last_name}`,
                phone: user.phone,
                user_type: user.user_type,
                dob: user.dob ? user.dob.toISOString().split('T')[0] : '',
                status: user.is_active ? 'Active' : 'Inactive',
                created_at: user.created_at,
                pan: user.pan_details?.[0]?.pan_number || 'N/A',
                bank_account: user.bank_details?.[0]?.account_no || 'N/A',
            });
        });

        // --- Sheet 2: SIP Details ---
        const fixedSips = await prisma.fixedSip.findMany({
            include: { user: true, sipPlanAdmin: true },
        });
        const flexibleSips = await prisma.flexibleSip.findMany({
            include: { user: true },
        });

        const sipSheet = workbook.addWorksheet('SIP Details');
        sipSheet.columns = [
            { header: 'SIP ID', key: 'id', width: 30 },
            { header: 'User Email', key: 'email', width: 25 },
            { header: 'Type', key: 'type', width: 15 },
            { header: 'Plan/Metal', key: 'plan_metal', width: 20 },
            { header: 'Paid Amount', key: 'paid_amount', width: 15 },
            { header: 'Months Paid', key: 'months_paid', width: 15 },
            { header: 'Status', key: 'status', width: 15 },
            { header: 'Next Due', key: 'next_due', width: 15 },
        ];

        fixedSips.forEach((sip) => {
            sipSheet.addRow({
                id: sip.id,
                email: sip.user.email,
                type: 'Fixed',
                plan_metal: sip.sipPlanAdmin?.Yojna_name || 'N/A',
                paid_amount: Number(sip.total_amount_paid || 0),
                months_paid: sip.months_paid,
                status: sip.status,
                next_due: sip.next_due_date ? sip.next_due_date.toISOString().split('T')[0] : '',
            });
        });

        flexibleSips.forEach((sip) => {
            sipSheet.addRow({
                id: sip.id,
                email: sip.user.email,
                type: 'Flexible',
                plan_metal: sip.metal_type,
                paid_amount: Number(sip.total_amount_paid || 0),
                months_paid: sip.months_paid,
                status: sip.status,
                next_due: sip.next_due_date ? sip.next_due_date.toISOString().split('T')[0] : '',
            });
        });

        // --- Sheet 3: Holdings ---
        const holdings = await prisma.holding.findMany({
            include: { user: true },
        });

        const holdingSheet = workbook.addWorksheet('Holdings');
        holdingSheet.columns = [
            { header: 'Holding ID', key: 'id', width: 30 },
            { header: 'User Email', key: 'email', width: 25 },
            { header: 'Metal Type', key: 'metal_type', width: 15 },
            { header: 'Quantity (gm)', key: 'qty', width: 15 },
            { header: 'Amount Invested', key: 'amt', width: 15 },
            { header: 'Last Updated', key: 'updated_at', width: 20 },
        ];

        holdings.forEach((holding) => {
            holdingSheet.addRow({
                id: holding.id,
                email: holding.user.email,
                metal_type: holding.metal_type,
                qty: Number(holding.qty || 0),
                amt: Number(holding.amt || 0),
                updated_at: holding.updated_at,
            });
        });

        // Set response headers
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            'attachment; filename=digigold_export.xlsx'
        );

        // Write to response
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Error exporting data:', error);
        res.status(500).json({ success: false, message: 'Failed to export data' });
    }
};
