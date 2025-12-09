import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: false, // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
    tls: {
        rejectUnauthorized: false,
    },
});

// Verify transporter on startup
transporter.verify((error, success) => {
    if (error) {
        console.error('SMTP Connection Error:', error);
    } else {
        console.log('SMTP Server is ready to send messages');
    }
});

export const sendEmail = async (to, subject, text, html) => {
    // Validate required fields
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.error("Missing SMTP credentials in environment variables");
        return null;
    }

    try {
        const info = await transporter.sendMail({
            from: process.env.EMAIL_FROM || process.env.SMTP_USER,
            to,
            subject,
            text: text || '',
            html: html || text || '',
        });

        console.log("Email sent successfully. Message ID:", info.messageId);
        return {
            success: true,
            messageId: info.messageId,
            info
        };
    } catch (error) {
        console.error("Error sending email:");
        console.error("Code:", error.code);
        console.error("Response:", error.response);

        return {
            success: false,
            error: error.message,
            code: error.code
        };
    }
};
