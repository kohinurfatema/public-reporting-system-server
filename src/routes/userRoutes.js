// src/routes/userRoutes.js

const express = require('express');
const User = require('../models/User'); // Import the User Model
const router = express.Router(); // 🎯 Minimal required boilerplate to fix TypeError

// ----------------------------------------------------------------------
// 1. POST /users
// Purpose: Create a new user in MongoDB upon successful Firebase registration.
// Path: POST /users (Handled by app.use('/users', usersRouter) in index.js)
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


module.exports = router;