// src/routes/paymentRoutes.js

const express = require('express');
const router = express.Router();
const Payment = require('../models/Payment');
const User = require('../models/User');
const Issue = require('../models/Issue');
const { verifyToken } = require('../middleware/auth');

// Initialize Stripe
const stripe = require('stripe')(process.env.STRIPE_SECRET);

// Client URL for redirects (using CLIENT_ORIGIN from .env)
const CLIENT_URL = process.env.CLIENT_ORIGIN || process.env.CLIENT_URL || 'http://localhost:5173';

// Apply token verification to all payment routes
router.use(verifyToken);

// POST /payments - Record a new payment
router.post('/', async (req, res) => {
    try {
        const { type, issueId, issueTitle } = req.body;
        const userEmail = req.user.email;

        // Get user details
        const user = await User.findOne({ email: userEmail });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Determine amount based on type
        const amount = type === 'boost' ? 100 : 1000;

        // Create payment record
        const payment = new Payment({
            userEmail,
            userName: user.name || userEmail,
            userPhoto: user.photoURL,
            type,
            amount,
            issueId: type === 'boost' ? issueId : null,
            issueTitle: type === 'boost' ? issueTitle : null,
            status: 'completed'
        });

        await payment.save();

        // If subscription, update user to premium
        if (type === 'subscription') {
            await User.findOneAndUpdate(
                { email: userEmail },
                { isPremium: true }
            );
        }

        // If boost, update issue priority
        if (type === 'boost' && issueId) {
            const issue = await Issue.findById(issueId);
            if (issue) {
                issue.priority = 'High';
                issue.timeline.push({
                    status: 'Boosted',
                    message: 'Issue priority boosted to High via payment',
                    updatedBy: 'Citizen',
                    updaterEmail: userEmail,
                    updatedAt: new Date()
                });
                await issue.save();
            }
        }

        res.status(201).json({
            message: 'Payment recorded successfully',
            payment,
            transactionId: payment.transactionId
        });
    } catch (error) {
        console.error('[POST /payments Error]', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// GET /payments/user/:email - Get user's payment history
router.get('/user/:email', async (req, res) => {
    try {
        const { email } = req.params;
        const { page = 1, limit = 10 } = req.query;

        // Verify user is requesting their own payments
        if (req.user.email !== email) {
            return res.status(403).json({ message: 'Unauthorized' });
        }

        const total = await Payment.countDocuments({ userEmail: email });
        const payments = await Payment.find({ userEmail: email })
            .sort({ createdAt: -1 })
            .skip((parseInt(page) - 1) * parseInt(limit))
            .limit(parseInt(limit));

        // Calculate total spent
        const totalSpent = await Payment.aggregate([
            { $match: { userEmail: email, status: 'completed' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);

        res.json({
            payments,
            totalSpent: totalSpent[0]?.total || 0,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / parseInt(limit)),
                totalItems: total
            }
        });
    } catch (error) {
        console.error('[GET /payments/user/:email Error]', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// GET /payments/invoice/:id - Get payment invoice data
router.get('/invoice/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const payment = await Payment.findById(id);

        if (!payment) {
            return res.status(404).json({ message: 'Payment not found' });
        }

        // Verify user owns this payment or is admin
        const user = await User.findOne({ email: req.user.email });
        if (payment.userEmail !== req.user.email && user?.role !== 'admin') {
            return res.status(403).json({ message: 'Unauthorized' });
        }

        res.json({
            invoice: {
                transactionId: payment.transactionId,
                date: payment.createdAt,
                userName: payment.userName,
                userEmail: payment.userEmail,
                type: payment.type,
                description: payment.type === 'boost'
                    ? `Priority Boost for Issue: ${payment.issueTitle || 'N/A'}`
                    : 'Premium Subscription',
                amount: payment.amount,
                status: payment.status
            }
        });
    } catch (error) {
        console.error('[GET /payments/invoice/:id Error]', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// POST /payments/create-checkout-session - Create Stripe Checkout session
router.post('/create-checkout-session', async (req, res) => {
    try {
        const { type, issueId, issueTitle } = req.body;
        const userEmail = req.user.email;

        // Validate type
        if (!type || !['boost', 'subscription'].includes(type)) {
            return res.status(400).json({ message: 'Invalid payment type' });
        }

        // Get user details
        const user = await User.findOne({ email: userEmail });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Check if user is blocked
        if (user.isBlocked) {
            return res.status(403).json({ message: 'Your account is blocked. Cannot make payments.' });
        }

        // For boost, verify issue exists and belongs to user
        if (type === 'boost') {
            if (!issueId) {
                return res.status(400).json({ message: 'Issue ID required for boost payment' });
            }
            const issue = await Issue.findById(issueId);
            if (!issue) {
                return res.status(404).json({ message: 'Issue not found' });
            }
            if (issue.priority === 'High') {
                return res.status(400).json({ message: 'Issue is already boosted' });
            }
        }

        // For subscription, check if already premium
        if (type === 'subscription' && user.isPremium) {
            return res.status(400).json({ message: 'You are already a premium user' });
        }

        // Determine amount and product name
        const amount = type === 'boost' ? 100 : 1000;
        const productName = type === 'boost'
            ? `Priority Boost: ${issueTitle || 'Issue'}`
            : 'Premium Subscription';

        // Create Stripe Checkout Session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'bdt',
                        product_data: {
                            name: productName,
                            description: type === 'boost'
                                ? 'Boost your issue priority to HIGH for faster resolution'
                                : 'Unlimited issue reporting with priority support',
                        },
                        unit_amount: amount * 100, // Stripe expects amount in smallest currency unit (paisa)
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            success_url: `${CLIENT_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}&type=${type}`,
            cancel_url: `${CLIENT_URL}/payment-cancel?type=${type}`,
            customer_email: userEmail,
            metadata: {
                type,
                userEmail,
                issueId: issueId || '',
                issueTitle: issueTitle || '',
            },
        });

        res.json({
            sessionId: session.id,
            url: session.url
        });
    } catch (error) {
        console.error('[POST /payments/create-checkout-session Error]', error);
        res.status(500).json({ message: 'Failed to create checkout session' });
    }
});

// POST /payments/verify - Verify Stripe payment and record in database
router.post('/verify', async (req, res) => {
    try {
        const { sessionId } = req.body;
        const userEmail = req.user.email;

        if (!sessionId) {
            return res.status(400).json({ message: 'Session ID required' });
        }

        // Retrieve the session from Stripe
        const session = await stripe.checkout.sessions.retrieve(sessionId);

        // Verify payment status
        if (session.payment_status !== 'paid') {
            return res.status(400).json({ message: 'Payment not completed' });
        }

        // Verify the session belongs to this user
        if (session.customer_email !== userEmail) {
            return res.status(403).json({ message: 'Unauthorized: Session does not belong to this user' });
        }

        // Check if payment already recorded (prevent duplicate processing)
        const existingPayment = await Payment.findOne({ transactionId: session.payment_intent });
        if (existingPayment) {
            return res.json({
                message: 'Payment already processed',
                payment: existingPayment,
                alreadyProcessed: true
            });
        }

        // Extract metadata
        const { type, issueId, issueTitle } = session.metadata;

        // Get user details
        const user = await User.findOne({ email: userEmail });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Determine amount
        const amount = type === 'boost' ? 100 : 1000;

        // Create payment record
        const payment = new Payment({
            userEmail,
            userName: user.name || userEmail,
            userPhoto: user.photoURL,
            type,
            amount,
            issueId: type === 'boost' && issueId ? issueId : null,
            issueTitle: type === 'boost' ? issueTitle : null,
            transactionId: session.payment_intent, // Use Stripe payment intent ID
            status: 'completed'
        });

        await payment.save();

        // If subscription, update user to premium
        if (type === 'subscription') {
            await User.findOneAndUpdate(
                { email: userEmail },
                { isPremium: true }
            );
        }

        // If boost, update issue priority
        if (type === 'boost' && issueId) {
            const issue = await Issue.findById(issueId);
            if (issue) {
                issue.priority = 'High';
                issue.timeline.push({
                    status: 'Boosted',
                    message: 'Issue priority boosted to High via Stripe payment',
                    updatedBy: 'Citizen',
                    updaterEmail: userEmail,
                    updatedAt: new Date()
                });
                await issue.save();
            }
        }

        res.json({
            message: 'Payment verified and recorded successfully',
            payment,
            transactionId: payment.transactionId
        });
    } catch (error) {
        console.error('[POST /payments/verify Error]', error);
        res.status(500).json({ message: 'Failed to verify payment' });
    }
});

module.exports = router;
