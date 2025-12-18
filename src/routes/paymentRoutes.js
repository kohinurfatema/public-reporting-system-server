// src/routes/paymentRoutes.js

const express = require('express');
const router = express.Router();
const Payment = require('../models/Payment');
const User = require('../models/User');
const Issue = require('../models/Issue');
const { verifyToken } = require('../middleware/auth');
const stripe = require('stripe')(process.env.STRIPE_SECRET);

// Apply token verification to all payment routes
router.use(verifyToken);

// POST /payments/create-checkout-session - Create Stripe checkout session
router.post('/create-checkout-session', async (req, res) => {
    try {
        const { type, issueId, issueTitle } = req.body;
        const userEmail = req.user.email;

        // Get user details
        const user = await User.findOne({ email: userEmail });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Determine amount and description based on type
        const amount = type === 'boost' ? 100 : 1000;
        const description = type === 'boost'
            ? `Priority Boost for Issue: ${issueTitle}`
            : 'Premium Subscription';

        // Create metadata to track payment details
        const metadata = {
            type,
            userEmail,
            userName: user.name || userEmail,
            ...(type === 'boost' && { issueId, issueTitle })
        };

        // Get client URL from environment or use default
        const clientURL = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

        // Create Stripe Checkout Session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'bdt',
                        product_data: {
                            name: description,
                            description: type === 'boost'
                                ? `Boost priority to HIGH for issue: ${issueTitle}`
                                : 'Unlock unlimited issue reporting and priority support',
                        },
                        unit_amount: amount * 100, // Stripe uses smallest currency unit
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            success_url: `${clientURL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${clientURL}/payment-cancelled`,
            metadata,
        });

        res.json({ url: session.url, sessionId: session.id });
    } catch (error) {
        console.error('[POST /payments/create-checkout-session Error]', error);
        res.status(500).json({ message: 'Internal server error', error: error.message });
    }
});

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
                    action: 'Priority Boosted',
                    description: 'Issue priority boosted to High via payment',
                    performedBy: user.name || userEmail,
                    timestamp: new Date()
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

// POST /payments/verify - Verify payment after Stripe checkout
router.post('/verify', async (req, res) => {
    try {
        const { sessionId } = req.body;
        const userEmail = req.user.email;

        if (!sessionId) {
            return res.status(400).json({ message: 'Session ID is required' });
        }

        // Retrieve the Stripe session
        const session = await stripe.checkout.sessions.retrieve(sessionId);

        if (!session) {
            return res.status(404).json({ message: 'Session not found' });
        }

        // Verify session belongs to the authenticated user
        if (session.metadata.userEmail !== userEmail) {
            return res.status(403).json({ message: 'Unauthorized' });
        }

        // Check if payment was successful
        if (session.payment_status !== 'paid') {
            return res.status(400).json({ message: 'Payment not completed' });
        }

        // Check if payment already processed
        const existingPayment = await Payment.findOne({ transactionId: session.id });
        if (existingPayment) {
            return res.json({
                message: 'Payment already processed',
                payment: existingPayment,
                alreadyProcessed: true
            });
        }

        // Get user details
        const user = await User.findOne({ email: userEmail });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Extract metadata
        const { type, issueId, issueTitle } = session.metadata;
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
            transactionId: session.id,
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
                    action: 'Priority Boosted',
                    description: 'Issue priority boosted to High via payment',
                    performedBy: user.name || userEmail,
                    timestamp: new Date()
                });
                await issue.save();
            }
        }

        res.json({
            message: 'Payment verified successfully',
            payment,
            alreadyProcessed: false
        });
    } catch (error) {
        console.error('[POST /payments/verify Error]', error);
        res.status(500).json({ message: 'Internal server error', error: error.message });
    }
});

module.exports = router;
