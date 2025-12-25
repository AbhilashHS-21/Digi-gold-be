import express from 'express';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import { authMiddleware } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Initialize Razorpay with environment variables
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

// ============================================
// CREATE RAZORPAY ORDER
// ============================================
// In your razorpay.js, update the create-order route:

// In your razorpay.js backend file, update the create-order route:

router.post('/create-order', authMiddleware, async (req, res) => {
    try {
        const { amount, metalType, sipMonths, sipType, sipId } = req.body;
        const userId = req.user.id;

        console.log('📋 Creating Razorpay order:', {
            amount,
            metalType,
            sipType,
            sipId,
            userId
        });

        // Validate inputs
        if (!amount || amount < 1) {
            return res.status(400).json({ error: 'Invalid amount' });
        }

        if (!sipId) {
            return res.status(400).json({ error: 'SIP ID is required' });
        }

        // Convert amount to paise
        const amountInPaise = Math.round(amount * 100);

        // FIX: Generate a shorter receipt ID (max 40 characters)
        const timestamp = Date.now();
        const shortSipId = sipId.substring(0, 10); // Take first 10 chars of SIP ID
        const receipt = `sip_${shortSipId}_${timestamp}.substring(0, 40)`; // Ensure max 40 chars

        console.log('📝 Generated receipt:', receipt, 'Length:', receipt.length);

        // Create order in Razorpay
        const order = await razorpay.orders.create({
            amount: amountInPaise,
            currency: 'INR',
            receipt: receipt, // Use the shorter receipt
            payment_capture: 1,
            notes: {
                sipId: sipId,
                sipType: sipType,
                metalType: metalType,
                sipMonths: sipMonths,
                userId: userId
            }
        });

        console.log('✅ Order created:', order.id);

        res.json({
            id: order.id,
            amount: order.amount,
            currency: order.currency,
            status: order.status
        });

    } catch (error) {
        console.error('❌ Error creating order:', error);

        // Better error messages
        let errorMessage = 'Failed to create payment order';
        if (error.error && error.error.description) {
            errorMessage = error.error.description;
        } else if (error.message) {
            errorMessage = error.message;
        }

        res.status(500).json({
            error: errorMessage,
            details: error.error || error.message
        });
    }
});

// ============================================
// VERIFY RAZORPAY PAYMENT
// ============================================
router.post('/verify-payment', authMiddleware, async (req, res) => {
    try {
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            sipId,
            amount
        } = req.body;

        const userId = req.user.id;

        // Validate inputs
        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({
                error: 'Missing payment details'
            });
        }

        console.log('🔐 Verifying payment:', {
            orderId: razorpay_order_id,
            paymentId: razorpay_payment_id,
            sipId
        });

        // Verify signature
        const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
        const data = `${razorpay_order_id}|${razorpay_payment_id}`;
        hmac.update(data);
        const generated_signature = hmac.digest('hex');

        if (generated_signature !== razorpay_signature) {
            console.error('❌ Signature verification failed');
            return res.status(400).json({
                success: false,
                error: 'Payment verification failed - Invalid signature'
            });
        }

        console.log('✅ Signature verified');

        // Fetch payment details
        const payment = await razorpay.payments.fetch(razorpay_payment_id);

        if (payment.status !== 'captured') {
            console.error('❌ Payment not captured:', payment.status);
            return res.status(400).json({
                success: false,
                error: 'Payment was not successfully processed'
            });
        }

        // Amount verification
        // In verifyPayment function, update the amount verification section:
        // Amount verification
        const receivedAmount = payment.amount / 100; // This converts from paise to rupees
        if (Math.abs(receivedAmount - amount) > 0.01) { // Allow small floating point differences
            console.error('❌ Amount mismatch:', {
                received: receivedAmount,
                expected: amount,
                receivedInPaise: payment.amount,
                expectedInPaise: amount * 100
            });
            return res.status(400).json({
                success: false,
                error: 'Payment amount mismatch'
            });
        }

        console.log('✅ Payment verified successfully');

        res.json({
            success: true,
            message: 'Payment verified successfully',
            payment: {
                orderId: razorpay_order_id,
                paymentId: razorpay_payment_id,
                amount: receivedAmount,
                status: payment.status,
                method: payment.method,
                email: payment.email,
                contact: payment.contact
            }
        });

    } catch (error) {
        console.error('❌ Error verifying payment:', error);
        res.status(500).json({
            success: false,
            error: 'Payment verification failed',
            message: error.message
        });
    }
});

// ============================================
// VERIFY OFFLINE PAYMENT
// ============================================
router.post('/verify-offline-payment', authMiddleware, async (req, res) => {
    try {
        const { sipId, amount, utr_no, transaction_type } = req.body;
        const userId = req.user.id;

        console.log('📤 Processing offline payment:', {
            sipId,
            amount,
            utr_no,
            transaction_type
        });

        if (!sipId || !amount || !utr_no) {
            return res.status(400).json({
                error: 'Missing offline payment details'
            });
        }

        res.json({
            success: true,
            message: 'Offline payment submitted for verification',
            status: 'pending_verification',
            details: {
                sipId,
                amount,
                utr_no,
                submittedAt: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('❌ Error processing offline payment:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to process offline payment',
            message: error.message
        });
    }
});

// ============================================
// WEBHOOK - Handle Razorpay Events
// ============================================
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
        const body = req.body.toString('utf-8');
        const signature = req.headers['x-razorpay-signature'];

        const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET);
        hmac.update(body);
        const generated_signature = hmac.digest('hex');

        if (generated_signature !== signature) {
            console.error('❌ Webhook signature verification failed');
            return res.status(400).json({ error: 'Invalid signature' });
        }

        const event = JSON.parse(body);
        console.log('🔔 Webhook received:', event.event);

        // Handle webhook events
        switch (event.event) {
            case 'payment.authorized':
                await handlePaymentAuthorized(event.payload.payment.entity);
                break;
            case 'payment.failed':
                await handlePaymentFailed(event.payload.payment.entity);
                break;
            case 'order.paid':
                await handleOrderPaid(event.payload.order.entity);
                break;
            case 'payment.captured':
                await handlePaymentCaptured(event.payload.payment.entity);
                break;
            default:
                console.log('⏭️ Unhandled webhook event:', event.event);
        }

        res.json({ success: true });

    } catch (error) {
        console.error('❌ Webhook error:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

// Webhook event handlers
async function handlePaymentAuthorized(payment) {
    console.log('✅ Payment authorized:', payment.id);
}

async function handlePaymentFailed(payment) {
    console.error('❌ Payment failed:', payment.id);
}

async function handleOrderPaid(order) {
    console.log('✅ Order paid:', order.id);
}

async function handlePaymentCaptured(payment) {
    console.log('✅ Payment captured:', payment.id);
}

// Export the router
export default router;