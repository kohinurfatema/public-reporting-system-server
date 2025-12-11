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
// Purpose: Fetch all issues reported by a specific user (Citizen Dashboard)
// Path: GET /issues/user/:email
// ----------------------------------------------------------------------
router.get('/user/:email', async (req, res) => {
    try {
        const reporterEmail = req.params.email;
        // Allow filtering by status and category from query parameters (e.g., ?status=Pending&category=Pothole)
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
// 3. PATCH /issues/:id
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

        // Update fields if provided in the request body
        issue.title = title || issue.title;
        issue.description = description || issue.description;
        issue.category = category || issue.category;
        issue.location = location || issue.location;
        
        // Handle image update (allows explicit null to remove an image, or update with a new URL)
        if (imageUrl !== undefined) {
            issue.imageUrl = imageUrl;
        }
        issue.updatedAt = new Date(); // Update timestamp

        // Add a new entry to the timeline
        issue.timeline.push({
            status: 'Pending', // Status remains Pending
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
// 4. DELETE /issues/:id
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


module.exports = router;