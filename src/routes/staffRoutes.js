// src/routes/staffRoutes.js

const express = require('express');
const router = express.Router();
const Issue = require('../models/Issue');
const User = require('../models/User');
const { verifyToken, verifyStaff } = require('../middleware/auth');

// Apply middleware to all staff routes
router.use(verifyToken, verifyStaff);

// GET /staff/stats/:email - Staff dashboard statistics
router.get('/stats/:email', async (req, res) => {
    try {
        const { email } = req.params;

        const staff = await User.findOne({ email, role: 'staff' });
        if (!staff) {
            return res.status(404).json({ message: 'Staff not found' });
        }

        const assignedIssues = await Issue.find({ assignedStaff: email });

        const totalAssigned = assignedIssues.length;
        const resolved = assignedIssues.filter(i => i.status === 'Resolved' || i.status === 'Closed').length;
        const inProgress = assignedIssues.filter(i => i.status === 'In-Progress' || i.status === 'Working').length;
        const pending = assignedIssues.filter(i => i.status === 'Pending').length;
        const highPriority = assignedIssues.filter(i => i.priority === 'High').length;

        // Today's active tasks
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todaysTasks = assignedIssues.filter(i =>
            ['Pending', 'In-Progress', 'Working'].includes(i.status)
        ).length;

        // Status distribution
        const statusDistribution = {
            Pending: pending,
            'In-Progress': assignedIssues.filter(i => i.status === 'In-Progress').length,
            Working: assignedIssues.filter(i => i.status === 'Working').length,
            Resolved: assignedIssues.filter(i => i.status === 'Resolved').length,
            Closed: assignedIssues.filter(i => i.status === 'Closed').length
        };

        // Category distribution
        const categoryDistribution = {};
        assignedIssues.forEach(issue => {
            categoryDistribution[issue.category] = (categoryDistribution[issue.category] || 0) + 1;
        });

        res.json({
            totalAssigned,
            resolved,
            inProgress,
            pending,
            highPriority,
            todaysTasks,
            statusDistribution,
            categoryDistribution
        });
    } catch (error) {
        console.error('Error fetching staff stats:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// GET /staff/issues/:email - Get all issues assigned to staff
router.get('/issues/:email', async (req, res) => {
    try {
        const { email } = req.params;
        const { status, priority, category, page = 1, limit = 10 } = req.query;

        const staff = await User.findOne({ email, role: 'staff' });
        if (!staff) {
            return res.status(404).json({ message: 'Staff not found' });
        }

        const filter = { assignedStaff: email };
        if (status && status !== 'all') filter.status = status;
        if (priority && priority !== 'all') filter.priority = priority;
        if (category && category !== 'all') filter.category = category;

        const total = await Issue.countDocuments(filter);

        // Boosted (High priority) first, then by date
        const issues = await Issue.find(filter)
            .sort({ priority: -1, createdAt: -1 })
            .skip((parseInt(page) - 1) * parseInt(limit))
            .limit(parseInt(limit));

        res.json({
            issues,
            total,
            page: parseInt(page),
            totalPages: Math.ceil(total / parseInt(limit))
        });
    } catch (error) {
        console.error('Error fetching staff issues:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// PATCH /staff/issues/:id/status - Update issue status
router.patch('/issues/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status, staffEmail, staffName } = req.body;

        const validStatuses = ['Pending', 'In-Progress', 'Working', 'Resolved', 'Closed'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ message: 'Invalid status' });
        }

        const issue = await Issue.findById(id);
        if (!issue) {
            return res.status(404).json({ message: 'Issue not found' });
        }

        if (issue.assignedStaff !== staffEmail) {
            return res.status(403).json({ message: 'You are not assigned to this issue' });
        }

        const previousStatus = issue.status;
        issue.status = status;

        issue.timeline.push({
            status: status,
            message: `Status changed from ${previousStatus} to ${status}`,
            updatedBy: 'Staff',
            updaterEmail: staffEmail,
            updatedAt: new Date()
        });

        await issue.save();

        res.json({
            message: 'Status updated successfully',
            issue
        });
    } catch (error) {
        console.error('Error updating issue status:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// GET /staff/issues/detail/:id - Get single issue details for staff
router.get('/issues/detail/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const issue = await Issue.findById(id);

        if (!issue) {
            return res.status(404).json({ message: 'Issue not found' });
        }

        res.json(issue);
    } catch (error) {
        console.error('Error fetching issue details:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

module.exports = router;
