// src/routes/userRoutes.js

const express = require('express');
const User = require('../models/User'); // Import the User Model
const router = express.Router(); 

// ----------------------------------------------------------------------
// 1. POST /users
// Purpose: Create a new user in MongoDB upon successful Firebase registration.
// Path: POST /users 
// ----------------------------------------------------------------------
router.post('/', async (req, res) => {
    // Expecting email, name, and photoURL from the client's registration process
    const { email, name, photoURL } = req.body;

    if (!email || !name) {
        return res.status(400).json({ message: 'Email and name are required for registration.' });
    }

    try {
        // 1. Check if the user already exists (important for preventing duplicates)
        const existingUser = await User.findOne({ email });

        if (existingUser) {
            // User exists, return the existing user data
            return res.json({
                message: 'User already exists in DB.',
                user: existingUser
            });
        }

        // 2. Create a new user instance with default citizen roles
        const newUser = new User({
            email,
            name,
            photoURL,
            role: 'citizen',
            isBlocked: false, // Default: not blocked
            isPremium: false,
            issuesReportedCount: 0
        });

        // 3. Save the new user to MongoDB
        const savedUser = await newUser.save();

        res.status(201).json({
            message: 'User successfully created in DB.',
            user: savedUser
        });

    } catch (error) {
        console.error('[User Registration Error]', error);
        res.status(500).json({ message: 'Internal server error during user creation.' });
    }
});


// ----------------------------------------------------------------------
// 2. GET /users/:email
// Purpose: Fetch a single user's profile data (needed for dashboard and limits)
// Path: GET /users/:email
// ----------------------------------------------------------------------
router.get('/:email', async (req, res) => {
    try {
        const email = req.params.email;
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        res.json(user);

    } catch (error) {
        console.error('[Fetch User Error]', error);
        res.status(500).json({ message: 'Internal server error while fetching user.' });
    }
});


// ----------------------------------------------------------------------
// 3. PATCH /users/upgrade/:email
// Purpose: Upgrade user to premium after successful payment. (Subscription logic)
// Path: PATCH /users/upgrade/:email
// ----------------------------------------------------------------------
router.patch('/upgrade/:email', async (req, res) => {
    const email = req.params.email;
    // In a real application, robust payment verification must occur here.

    try {
        const result = await User.updateOne(
            { email: email },
            { $set: { isPremium: true } } // Set to true
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: 'User not found.' });
        }
        
        res.json({ message: 'Subscription successful! You are now a premium user.' });

    } catch (error) {
        console.error('[User Upgrade Error]', error);
        res.status(500).json({ message: 'Internal server error during subscription upgrade.' });
    }
});


// ----------------------------------------------------------------------
// 4. PATCH /users/:email
// Purpose: Allows user to update their name/photoURL (basic profile edit)
// Path: PATCH /users/:email
// ----------------------------------------------------------------------
router.patch('/:email', async (req, res) => {
    const email = req.params.email;
    const { name, photoURL } = req.body;

    try {
        const updateData = {};
        if (name) updateData.name = name;
        if (photoURL !== undefined) updateData.photoURL = photoURL; // Allow setting to null/empty string

        const result = await User.updateOne(
            { email: email },
            { $set: updateData }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: 'User not found.' });
        }
        
        // Return the updated user data to refresh the UI instantly
        const updatedUser = await User.findOne({ email });
        res.json({ message: 'Profile updated successfully.', user: updatedUser });

    } catch (error) {
        console.error('[User Profile Update Error]', error);
        res.status(500).json({ message: 'Internal server error during profile update.' });
    }
});


module.exports = router;