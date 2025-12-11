// src/models/User.js

const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    // AUTHENTICATION
    email: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    photoURL: { type: String, default: null },
    
    // ROLE & STATUS
    role: { 
        type: String, 
        required: true, 
        default: 'citizen',
        // Must support all three roles for Admin/Staff/Citizen Dashboards
        enum: ['citizen', 'staff', 'admin']
    },
    isBlocked: { type: Boolean, default: false }, // For Admin Manage Users
    
    // ISSUE LIMITS & SUBSCRIPTION
    isPremium: { type: Boolean, default: false }, // For Premium citizens
    issuesReportedCount: { type: Number, default: 0 }, // For free user limit (max 3)
    
    // TIMESTAMPS
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);