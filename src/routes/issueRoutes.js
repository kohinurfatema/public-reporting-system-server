// src/routes/issueRoutes.js

const express = require('express');
const router = express.Router();
const Issue = require('../models/Issue'); // Import Issue Model
const User = require('../models/User'); // Import User Model

// Define the maximum free reports based on requirements
const MAX_FREE_ISSUES = 3;

// ----------------------------------------------------------------------
// 1. POST /issues
// Purpose: Receive issue report data, check limits, save the issue, and update user count.
// Path: POST /issues
// ----------------------------------------------------------------------
router.post('/', async (req, res) => {
    // Data expected from the client-side form (ReportIssue.jsx)
    const {
        reporterEmail,
        title,
        description,
        category,
        location,
        imageUrl // Client should upload image first and send the URL
    } = req.body;

    // Basic validation
    if (!reporterEmail || !title || !description || !category || !location) {
        return res.status(400).json({ message: 'Missing required issue fields.' });
    }

    try {
        // Step 1: Check User Limit (Required for free users)
        const user = await User.findOne({ email: reporterEmail });

        if (!user) {
            return res.status(404).json({ message: 'Reporter user not found in database.' });
        }

        // Blocked User Check
        if (user.isBlocked) {
             return res.status(403).json({ message: 'Your account is blocked and cannot submit issues.' });
        }

        // Check if the user is a free user AND has reached the limit of 3 issues
        if (!user.isPremium && user.issuesReportedCount >= MAX_FREE_ISSUES) {
            return res.status(403).json({
                message: `Free user limit reached (${MAX_FREE_ISSUES}). Please subscribe to report more issues.`,
                limitReached: true
            });
        }

        // Step 2: Prepare the initial timeline entry
        const initialTimelineEntry = {
            status: 'Pending',
            message: 'Issue reported by citizen.',
            updatedBy: 'Citizen',
            updaterEmail: reporterEmail,
            updatedAt: new Date()
        };

        // Step 3: Create the New Issue Document
        const newIssue = new Issue({
            reporterEmail,
            title,
            description,
            category,
            location,
            imageUrl: imageUrl || null,
            status: 'Pending', // Initial status
            priority: 'Normal', // Default priority
            timeline: [initialTimelineEntry], // Initial tracking record
        });

        const savedIssue = await newIssue.save();

        // Step 4: Update the User's Issue Count (Crucial for limit tracking)
        // Use $inc (increment) for atomic update
        await User.updateOne(
            { email: reporterEmail },
            { $inc: { issuesReportedCount: 1 } }
        );

        // Step 5: Send success response
        res.status(201).json({
            message: 'Issue successfully reported and user count updated.',
            issue: savedIssue
        });

    } catch (error) {
        console.error('[POST /issues Error]', error);
        res.status(500).json({ message: 'An internal server error occurred while reporting the issue.' });
    }
});


// ----------------------------------------------------------------------
// 2. GET /issues/user/:email
// Purpose: Fetch all issues reported by a specific user (My Issues Page)
// Path: GET /issues/user/:email?status=X&category=Y
// ----------------------------------------------------------------------
router.get('/user/:email', async (req, res) => {
    try {
        const reporterEmail = req.params.email;
        // Allow filtering by status and category from query parameters
        const { status, category } = req.query;

        let filter = { reporterEmail: reporterEmail };

        // Apply filters if provided
        if (status) {
            filter.status = status;
        }
        if (category) {
            filter.category = category;
        }

        // Find all issues matching the filter, sorted by creation date (newest first)
        const issues = await Issue.find(filter)
            .sort({ createdAt: -1 });

        // Return the array of issues (empty array if none found)
        res.json(issues);

    } catch (error) {
        console.error('[GET /issues/user/:email Error]', error);
        res.status(500).json({ message: 'An internal server error occurred while fetching user issues.' });
    }
});


// ----------------------------------------------------------------------
// 3. GET /issues/stats/:email
// Purpose: Fetch total counts (submitted, pending, resolved) for the Citizen Dashboard Home.
// Path: GET /issues/stats/:email
// ----------------------------------------------------------------------
router.get('/stats/:email', async (req, res) => {
    const reporterEmail = req.params.email;

    try {
        const stats = await Issue.aggregate([
            // Stage 1: Filter issues to only include those reported by the logged-in user
            { $match: { reporterEmail: reporterEmail } },

            // Stage 2: Group all matching documents together to calculate counts
            {
                $group: {
                    _id: null,
                    totalSubmitted: { $sum: 1 },

                    // Count issues by specific status
                    totalPending: {
                        $sum: { $cond: [{ $eq: ["$status", "Pending"] }, 1, 0] }
                    },
                    totalInProgress: {
                        $sum: { $cond: [{ $in: ["$status", ["In-Progress", "Working"]] }, 1, 0] }
                    },
                    totalResolved: {
                        $sum: { $cond: [{ $eq: ["$status", "Resolved"] }, 1, 0] }
                    },
                }
            },

            // Stage 3: Clean up the output structure
            {
                $project: {
                    _id: 0,
                    totalSubmitted: 1,
                    totalPending: 1,
                    totalInProgress: 1,
                    totalResolved: 1,
                }
            }
        ]);

        // If no issues are found, return default zero counts
        const userStats = stats.length > 0 ? stats[0] : {
            totalSubmitted: 0,
            totalPending: 0,
            totalInProgress: 0,
            totalResolved: 0,
        };

        res.json(userStats);

    } catch (error) {
        console.error('[GET /issues/stats/:email Error]', error);
        res.status(500).json({ message: 'Internal server error while fetching dashboard stats.' });
    }
});


// ----------------------------------------------------------------------
// 4. GET /issues/latest-resolved (PUBLIC - For Home Page)
// Purpose: Get latest resolved issues for display on home page
// Path: GET /issues/latest-resolved?limit=6
// NOTE: This route MUST come BEFORE /:id routes to avoid matching "latest-resolved" as an ID
// ----------------------------------------------------------------------
router.get('/latest-resolved', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 6;

        // Fetch resolved issues, sorted by most recently resolved
        const issues = await Issue.find({ status: 'Resolved' })
            .sort({ updatedAt: -1 })
            .limit(limit)
            .select('title category location status priority imageUrl upvotes createdAt updatedAt');

        res.json(issues);

    } catch (error) {
        console.error('[GET /issues/latest-resolved Error]', error);
        res.status(500).json({ message: 'Internal server error while fetching latest resolved issues.' });
    }
});


// ----------------------------------------------------------------------
// 5. PATCH /issues/:id
// Purpose: Citizen edits issue details (ONLY if status is 'Pending')
// Path: PATCH /issues/:id
// ----------------------------------------------------------------------
router.patch('/:id', async (req, res) => {
    const issueId = req.params.id;
    const { title, description, category, location, imageUrl } = req.body;

    try {
        const issue = await Issue.findById(issueId);

        if (!issue) {
            return res.status(404).json({ message: 'Issue not found.' });
        }

        // REQUIREMENT: Only allow editing if the status is 'Pending'
        if (issue.status !== 'Pending') {
            return res.status(403).json({ message: `Issue status is '${issue.status}'. Only 'Pending' issues can be edited.` });
        }

        // Blocked User Check (Server-side defense)
        const user = await User.findOne({ email: issue.reporterEmail });
        if (user && user.isBlocked) {
            return res.status(403).json({ message: 'Your account is blocked and cannot edit issues.' });
        }


        // Update fields
        issue.title = title || issue.title;
        issue.description = description || issue.description;
        issue.category = category || issue.category;
        issue.location = location || issue.location;

        if (imageUrl !== undefined) {
            issue.imageUrl = imageUrl;
        }
        issue.updatedAt = new Date();

        // Add a new entry to the timeline
        issue.timeline.push({
            status: 'Pending',
            message: 'Issue details updated by citizen.',
            updatedBy: 'Citizen',
            updaterEmail: issue.reporterEmail,
            updatedAt: new Date()
        });

        const updatedIssue = await issue.save();

        res.json({ message: 'Issue successfully updated.', issue: updatedIssue });

    } catch (error) {
        console.error('[PATCH /issues/:id Error]', error);
        res.status(500).json({ message: 'Internal server error during issue update.' });
    }
});


// ----------------------------------------------------------------------
// 5. DELETE /issues/:id
// Purpose: Citizen deletes issue (ONLY if status is 'Pending')
// Path: DELETE /issues/:id
// ----------------------------------------------------------------------
router.delete('/:id', async (req, res) => {
    const issueId = req.params.id;

    try {
        const issue = await Issue.findById(issueId);

        if (!issue) {
            return res.status(404).json({ message: 'Issue not found.' });
        }

        // REQUIREMENT: Only allow deletion if the status is 'Pending'
        if (issue.status !== 'Pending') {
            return res.status(403).json({ message: `Issue status is '${issue.status}'. Only 'Pending' issues can be deleted.` });
        }

        // Blocked User Check (Server-side defense)
        const user = await User.findOne({ email: issue.reporterEmail });
        if (user && user.isBlocked) {
            return res.status(403).json({ message: 'Your account is blocked and cannot delete issues.' });
        }

        // Remove the issue from the database
        const result = await Issue.deleteOne({ _id: issueId });

        if (result.deletedCount === 0) {
            return res.status(500).json({ message: 'Issue could not be deleted.' });
        }

        // CRUCIAL: Decrement the user's issue count for limit tracking
        await User.updateOne(
            { email: issue.reporterEmail },
            { $inc: { issuesReportedCount: -1 } }
        );

        res.json({ message: 'Issue successfully deleted and user count decremented.' });

    } catch (error) {
        console.error('[DELETE /issues/:id Error]', error);
        res.status(500).json({ message: 'Internal server error during issue deletion.' });
    }
});


// ----------------------------------------------------------------------
// 6. GET /issues/:id (NEW ROUTE)
// Purpose: Fetch a single issue by ID (for IssueDetails page)
// Path: GET /issues/:id
// ----------------------------------------------------------------------
router.get('/:id', async (req, res) => {
    try {
        const issueId = req.params.id;
        // Use select('-staffPassword') if the Issue model includes staff data you want to exclude
        const issue = await Issue.findById(issueId); 

        if (!issue) {
            return res.status(404).json({ message: 'Issue not found.' });
        }

        res.json(issue);

    } catch (error) {
        console.error('[GET /issues/:id Error]', error);
        res.status(500).json({ message: 'Internal server error while fetching issue details.' });
    }
});


// ----------------------------------------------------------------------
// 7. PATCH /issues/boost/:id (NEW ROUTE - Boost Priority)
// Purpose: Boost priority to High (after payment) and record timeline event.
// Path: PATCH /issues/boost/:id
// ----------------------------------------------------------------------
const ISSUE_BOOST_PRICE = 100; // Define the boost price on the server as well

router.patch('/boost/:id', async (req, res) => {
    const issueId = req.params.id;
    // const { paymentId } = req.body; // In a real app, you'd verify a paymentId here

    try {
        const issue = await Issue.findById(issueId);

        if (!issue) {
            return res.status(404).json({ message: 'Issue not found.' });
        }
        
        // Prevent boosting if already high priority
        if (issue.priority === 'High') {
            return res.status(400).json({ message: 'Issue is already at High priority.' });
        }

        // --- 1. Perform Payment Verification (Simulated for this implementation) ---
        // In a real application, you would contact your payment gateway (Stripe/SSLCommerz)
        // using the payment details passed in req.body to ensure 100tk was paid.

        // --- 2. Update Issue Priority and Timeline ---
        issue.priority = 'High';
        
        issue.timeline.push({
            status: issue.status, // Keep current status
            message: `Priority boosted to HIGH via citizen payment (${ISSUE_BOOST_PRICE}tk simulated).`,
            updatedBy: 'Citizen', // Updated by the citizen who paid
            updaterEmail: issue.reporterEmail,
            updatedAt: new Date()
        });

        const updatedIssue = await issue.save();

        res.json({ 
            message: 'Issue priority boosted successfully.', 
            issue: updatedIssue 
        });

    } catch (error) {
        console.error('[PATCH /issues/boost/:id Error]', error);
        res.status(500).json({ message: 'Internal server error during boost process.' });
    }
});


// ----------------------------------------------------------------------
// 8. GET /issues (PUBLIC - All Issues with filters, search, pagination)
// Purpose: Fetch all issues for public All Issues page
// Path: GET /issues?page=1&limit=10&search=X&status=X&category=X&priority=X
// ----------------------------------------------------------------------
router.get('/', async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            search = '',
            status = '',
            category = '',
            priority = ''
        } = req.query;

        // Build filter object
        let filter = {};

        // Search filter (by title, category, or location)
        if (search) {
            filter.$or = [
                { title: { $regex: search, $options: 'i' } },
                { category: { $regex: search, $options: 'i' } },
                { location: { $regex: search, $options: 'i' } }
            ];
        }

        // Status filter
        if (status) {
            filter.status = status;
        }

        // Category filter
        if (category) {
            filter.category = category;
        }

        // Priority filter
        if (priority) {
            filter.priority = priority;
        }

        // Count total matching documents for pagination
        const total = await Issue.countDocuments(filter);

        // Fetch issues with pagination
        // Sort by priority (High first) then by createdAt (newest first)
        const issues = await Issue.find(filter)
            .sort({ priority: -1, createdAt: -1 })
            .skip((parseInt(page) - 1) * parseInt(limit))
            .limit(parseInt(limit));

        res.json({
            issues,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / parseInt(limit)),
                totalItems: total,
                itemsPerPage: parseInt(limit)
            }
        });

    } catch (error) {
        console.error('[GET /issues Error]', error);
        res.status(500).json({ message: 'Internal server error while fetching issues.' });
    }
});


// ----------------------------------------------------------------------
// 9. PATCH /issues/:id/upvote (Upvote an issue)
// Purpose: Allow logged-in user to upvote an issue (once per issue)
// Path: PATCH /issues/:id/upvote
// ----------------------------------------------------------------------
router.patch('/:id/upvote', async (req, res) => {
    const issueId = req.params.id;
    const { userEmail } = req.body;

    if (!userEmail) {
        return res.status(400).json({ message: 'User email is required to upvote.' });
    }

    try {
        const issue = await Issue.findById(issueId);

        if (!issue) {
            return res.status(404).json({ message: 'Issue not found.' });
        }

        // Check if user is trying to upvote their own issue
        if (issue.reporterEmail === userEmail) {
            return res.status(403).json({ message: 'You cannot upvote your own issue.' });
        }

        // Check if user has already upvoted
        if (issue.upvotes.includes(userEmail)) {
            return res.status(400).json({ message: 'You have already upvoted this issue.' });
        }

        // Add user to upvotes array
        issue.upvotes.push(userEmail);
        await issue.save();

        res.json({
            message: 'Upvote successful!',
            upvoteCount: issue.upvotes.length
        });

    } catch (error) {
        console.error('[PATCH /issues/:id/upvote Error]', error);
        res.status(500).json({ message: 'Internal server error during upvote.' });
    }
});


module.exports = router;