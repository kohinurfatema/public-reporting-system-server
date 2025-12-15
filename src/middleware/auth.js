// src/middleware/auth.js

const { admin } = require('../config/firebase');
const User = require('../models/User');

// Verify Firebase ID Token
const verifyToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Unauthorized: No token provided' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        req.user = decodedToken;
        next();
    } catch (error) {
        console.error('[auth] Token verification failed:', error.message);
        return res.status(401).json({ message: 'Unauthorized: Invalid token' });
    }
};

// Verify Admin Role
const verifyAdmin = async (req, res, next) => {
    try {
        const email = req.user?.email;

        if (!email) {
            return res.status(401).json({ message: 'Unauthorized: No email found' });
        }

        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (user.role !== 'admin') {
            return res.status(403).json({ message: 'Forbidden: Admin access required' });
        }

        req.dbUser = user;
        next();
    } catch (error) {
        console.error('[auth] Admin verification failed:', error.message);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

// Verify Staff Role
const verifyStaff = async (req, res, next) => {
    try {
        const email = req.user?.email;

        if (!email) {
            return res.status(401).json({ message: 'Unauthorized: No email found' });
        }

        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (user.role !== 'staff') {
            return res.status(403).json({ message: 'Forbidden: Staff access required' });
        }

        req.dbUser = user;
        next();
    } catch (error) {
        console.error('[auth] Staff verification failed:', error.message);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

// Verify Admin or Staff Role
const verifyAdminOrStaff = async (req, res, next) => {
    try {
        const email = req.user?.email;

        if (!email) {
            return res.status(401).json({ message: 'Unauthorized: No email found' });
        }

        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (user.role !== 'admin' && user.role !== 'staff') {
            return res.status(403).json({ message: 'Forbidden: Admin or Staff access required' });
        }

        req.dbUser = user;
        next();
    } catch (error) {
        console.error('[auth] Admin/Staff verification failed:', error.message);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

module.exports = { verifyToken, verifyAdmin, verifyStaff, verifyAdminOrStaff };
