// src/routes/adminRoutes.js

const express = require('express');
const router = express.Router();
const Issue = require('../models/Issue');
const User = require('../models/User');
const Payment = require('../models/Payment');
const { verifyToken, verifyAdmin } = require('../middleware/auth');
const admin = require('firebase-admin');

// Apply middleware to all admin routes
router.use(verifyToken, verifyAdmin);

// ----------------------------------------------------------------------
// 1. GET /admin/stats
// Purpose: Get admin dashboard statistics
// ----------------------------------------------------------------------
router.get('/stats', async (req, res) => {
    try {
        // Get issue counts by status
        const issueStats = await Issue.aggregate([
            {
                $group: {
                    _id: null,
                    totalIssues: { $sum: 1 },
                    pending: { $sum: { $cond: [{ $eq: ['$status', 'Pending'] }, 1, 0] } },
                    inProgress: { $sum: { $cond: [{ $in: ['$status', ['In-Progress', 'Working']] }, 1, 0] } },
                    resolved: { $sum: { $cond: [{ $eq: ['$status', 'Resolved'] }, 1, 0] } },
                    rejected: { $sum: { $cond: [{ $eq: ['$status', 'Rejected'] }, 1, 0] } },
                    closed: { $sum: { $cond: [{ $eq: ['$status', 'Closed'] }, 1, 0] } }
                }
            }
        ]);

        // Get user counts
        const userStats = await User.aggregate([
            {
                $group: {
                    _id: null,
                    totalUsers: { $sum: 1 },
                    citizens: { $sum: { $cond: [{ $eq: ['$role', 'citizen'] }, 1, 0] } },
                    staff: { $sum: { $cond: [{ $eq: ['$role', 'staff'] }, 1, 0] } },
                    admins: { $sum: { $cond: [{ $eq: ['$role', 'admin'] }, 1, 0] } },
                    premiumUsers: { $sum: { $cond: ['$isPremium', 1, 0] } },
                    blockedUsers: { $sum: { $cond: ['$isBlocked', 1, 0] } }
                }
            }
        ]);

        // Calculate total payments (premium subscriptions + boosts)
        const premiumCount = userStats.length > 0 ? userStats[0].premiumUsers : 0;
        const boostedIssues = await Issue.countDocuments({ priority: 'High' });
        const totalPayments = (premiumCount * 1000) + (boostedIssues * 100);

        res.json({
            issues: issueStats.length > 0 ? issueStats[0] : {
                totalIssues: 0, pending: 0, inProgress: 0, resolved: 0, rejected: 0, closed: 0
            },
            users: userStats.length > 0 ? userStats[0] : {
                totalUsers: 0, citizens: 0, staff: 0, admins: 0, premiumUsers: 0, blockedUsers: 0
            },
            totalPayments,
            boostedIssues
        });
    } catch (error) {
        console.error('[GET /admin/stats Error]', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});


// ----------------------------------------------------------------------
// 2. GET /admin/issues
// Purpose: Get all issues for admin with pagination and filters
// ----------------------------------------------------------------------
router.get('/issues', async (req, res) => {
    try {
        const { page = 1, limit = 10, status, category, priority, search } = req.query;

        let filter = {};
        if (status) filter.status = status;
        if (category) filter.category = category;
        if (priority) filter.priority = priority;
        if (search) {
            filter.$or = [
                { title: { $regex: search, $options: 'i' } },
                { location: { $regex: search, $options: 'i' } },
                { reporterEmail: { $regex: search, $options: 'i' } }
            ];
        }

        const total = await Issue.countDocuments(filter);
        const issues = await Issue.aggregate([
            { $match: filter },
            {
                $addFields: {
                    priorityOrder: {
                        $cond: {
                            if: { $eq: ['$priority', 'High'] },
                            then: 0,  // High priority comes first
                            else: 1   // Normal priority comes second
                        }
                    }
                }
            },
            { $sort: { priorityOrder: 1, createdAt: -1 } },
            { $skip: (parseInt(page) - 1) * parseInt(limit) },
            { $limit: parseInt(limit) }
        ]);

        res.json({
            issues,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / parseInt(limit)),
                totalItems: total
            }
        });
    } catch (error) {
        console.error('[GET /admin/issues Error]', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});


// ----------------------------------------------------------------------
// 3. PATCH /admin/issues/:id/assign
// Purpose: Assign staff to an issue
// ----------------------------------------------------------------------
router.patch('/issues/:id/assign', async (req, res) => {
    const { id } = req.params;
    const { staffEmail, staffName, adminEmail } = req.body;

    try {
        const issue = await Issue.findById(id);
        if (!issue) {
            return res.status(404).json({ message: 'Issue not found' });
        }

        // Verify staff exists and is a staff member
        const staff = await User.findOne({ email: staffEmail, role: 'staff' });
        if (!staff) {
            return res.status(404).json({ message: 'Staff member not found' });
        }

        // Update issue with staff assignment (set both fields for compatibility)
        issue.assignedStaff = staffEmail; // For staff routes
        issue.staffAssigned = {
            email: staffEmail,
            name: staffName || staff.name
        };

        // Update status to In-Progress if still pending
        if (issue.status === 'Pending') {
            issue.status = 'In-Progress';
        }

        // Add timeline entry
        issue.timeline.push({
            status: issue.status,
            message: `Assigned to staff: ${staffName || staff.name}`,
            updatedBy: 'Admin',
            updaterEmail: adminEmail,
            updatedAt: new Date()
        });

        await issue.save();

        res.json({ message: 'Staff assigned successfully', issue });
    } catch (error) {
        console.error('[PATCH /admin/issues/:id/assign Error]', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});


// ----------------------------------------------------------------------
// 4. PATCH /admin/issues/:id/reject
// Purpose: Reject an issue
// ----------------------------------------------------------------------
router.patch('/issues/:id/reject', async (req, res) => {
    const { id } = req.params;
    const { reason, adminEmail } = req.body;

    try {
        const issue = await Issue.findById(id);
        if (!issue) {
            return res.status(404).json({ message: 'Issue not found' });
        }

        if (issue.status !== 'Pending') {
            return res.status(400).json({ message: 'Only pending issues can be rejected' });
        }

        issue.status = 'Rejected';
        issue.timeline.push({
            status: 'Rejected',
            message: reason || 'Issue rejected by admin',
            updatedBy: 'Admin',
            updaterEmail: adminEmail,
            updatedAt: new Date()
        });

        await issue.save();

        res.json({ message: 'Issue rejected successfully', issue });
    } catch (error) {
        console.error('[PATCH /admin/issues/:id/reject Error]', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});


// ----------------------------------------------------------------------
// 5. GET /admin/users
// Purpose: Get all citizen users
// ----------------------------------------------------------------------
router.get('/users', async (req, res) => {
    try {
        const { page = 1, limit = 10, search } = req.query;

        let filter = { role: 'citizen' };
        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }

        const total = await User.countDocuments(filter);
        const users = await User.find(filter)
            .select('-password')
            .sort({ createdAt: -1 })
            .skip((parseInt(page) - 1) * parseInt(limit))
            .limit(parseInt(limit));

        res.json({
            users,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / parseInt(limit)),
                totalItems: total
            }
        });
    } catch (error) {
        console.error('[GET /admin/users Error]', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});


// ----------------------------------------------------------------------
// 6. PATCH /admin/users/:email/block
// Purpose: Block or unblock a user
// ----------------------------------------------------------------------
router.patch('/users/:email/block', async (req, res) => {
    const { email } = req.params;
    const { isBlocked } = req.body;

    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        user.isBlocked = isBlocked;
        await user.save();

        res.json({
            message: isBlocked ? 'User blocked successfully' : 'User unblocked successfully',
            user
        });
    } catch (error) {
        console.error('[PATCH /admin/users/:email/block Error]', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});


// ----------------------------------------------------------------------
// 7. GET /admin/staff
// Purpose: Get all staff members
// ----------------------------------------------------------------------
router.get('/staff', async (req, res) => {
    try {
        const staff = await User.find({ role: 'staff' })
            .select('-password')
            .sort({ createdAt: -1 });

        res.json(staff);
    } catch (error) {
        console.error('[GET /admin/staff Error]', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});


// ----------------------------------------------------------------------
// 8. POST /admin/staff
// Purpose: Create a new staff member
// NOTE: Creates both Firebase Auth account AND MongoDB user document
// ----------------------------------------------------------------------
router.post('/staff', async (req, res) => {
    const { email, name, photoURL, phone, department, password } = req.body;

    try {
        // Validate password is provided
        if (!password || password.length < 6) {
            return res.status(400).json({ message: 'Password is required and must be at least 6 characters' });
        }

        // Check if user already exists in MongoDB
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'User with this email already exists' });
        }

        // Create Firebase Auth account first
        let firebaseUser;
        try {
            firebaseUser = await admin.auth().createUser({
                email,
                password,
                displayName: name,
                photoURL: photoURL || null
            });
        } catch (firebaseError) {
            console.error('[Firebase Auth Error]', firebaseError);
            return res.status(400).json({
                message: 'Failed to create Firebase account',
                error: firebaseError.message
            });
        }

        // Create MongoDB user document
        const newStaff = new User({
            email,
            name,
            photoURL: photoURL || null,
            phone: phone || null,
            department: department || 'General',
            role: 'staff',
            isBlocked: false,
            isPremium: false,
            issuesReportedCount: 0
        });

        await newStaff.save();

        res.status(201).json({
            message: 'Staff created successfully with Firebase Auth account',
            staff: newStaff,
            firebaseUid: firebaseUser.uid
        });
    } catch (error) {
        console.error('[POST /admin/staff Error]', error);

        // If MongoDB save fails but Firebase account was created, try to delete the Firebase account
        if (error.name === 'MongoError' || error.name === 'ValidationError') {
            try {
                const user = await admin.auth().getUserByEmail(email);
                await admin.auth().deleteUser(user.uid);
                console.log('[Cleanup] Deleted Firebase account after MongoDB failure');
            } catch (cleanupError) {
                console.error('[Cleanup Error]', cleanupError);
            }
        }

        res.status(500).json({ message: 'Internal server error' });
    }
});


// ----------------------------------------------------------------------
// 9. PATCH /admin/staff/:email
// Purpose: Update staff member details
// ----------------------------------------------------------------------
router.patch('/staff/:email', async (req, res) => {
    const { email } = req.params;
    const { name, photoURL, phone, department } = req.body;

    try {
        const staff = await User.findOne({ email, role: 'staff' });
        if (!staff) {
            return res.status(404).json({ message: 'Staff member not found' });
        }

        if (name) staff.name = name;
        if (photoURL !== undefined) staff.photoURL = photoURL;
        if (phone !== undefined) staff.phone = phone;
        if (department) staff.department = department;

        await staff.save();

        res.json({ message: 'Staff updated successfully', staff });
    } catch (error) {
        console.error('[PATCH /admin/staff/:email Error]', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});


// ----------------------------------------------------------------------
// 10. DELETE /admin/staff/:email
// Purpose: Delete a staff member
// ----------------------------------------------------------------------
router.delete('/staff/:email', async (req, res) => {
    const { email } = req.params;

    try {
        const result = await User.deleteOne({ email, role: 'staff' });
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'Staff member not found' });
        }

        res.json({ message: 'Staff deleted successfully' });
    } catch (error) {
        console.error('[DELETE /admin/staff/:email Error]', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});


// ----------------------------------------------------------------------
// 11. GET /admin/latest
// Purpose: Get latest issues, users for dashboard overview
// ----------------------------------------------------------------------
router.get('/latest', async (req, res) => {
    try {
        const latestIssues = await Issue.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .select('title status priority category createdAt reporterEmail');

        const latestUsers = await User.find({ role: 'citizen' })
            .sort({ createdAt: -1 })
            .limit(5)
            .select('name email photoURL isPremium createdAt');

        res.json({ latestIssues, latestUsers });
    } catch (error) {
        console.error('[GET /admin/latest Error]', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});


// ----------------------------------------------------------------------
// 12. GET /admin/payments
// Purpose: Get all payments with filters and pagination
// ----------------------------------------------------------------------
router.get('/payments', async (req, res) => {
    try {
        const { page = 1, limit = 10, type } = req.query;

        let filter = {};
        if (type && type !== 'all') filter.type = type;

        const total = await Payment.countDocuments(filter);
        const payments = await Payment.find(filter)
            .sort({ createdAt: -1 })
            .skip((parseInt(page) - 1) * parseInt(limit))
            .limit(parseInt(limit));

        // Calculate total revenue
        const totalRevenue = await Payment.aggregate([
            { $match: { status: 'completed' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);

        res.json({
            payments,
            totalAmount: totalRevenue[0]?.total || 0,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / parseInt(limit)),
                totalItems: total
            }
        });
    } catch (error) {
        console.error('[GET /admin/payments Error]', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});


module.exports = router;