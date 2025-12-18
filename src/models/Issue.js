// src/models/Issue.js

const mongoose = require('mongoose');

// --- Timeline Item Schema (for tracking issue history) ---
// Timeline entries should be read-only to preserve audit history
const TimelineSchema = new mongoose.Schema({
    status: { 
        type: String, 
        required: true,
        enum: ['Pending', 'In-Progress', 'Working', 'Resolved', 'Closed', 'Rejected', 'Boosted'] 
    },
    message: { type: String, trim: true },
    updatedBy: { type: String, enum: ['Admin', 'Staff', 'Citizen'], required: true },
    updaterEmail: { type: String }, 
    updatedAt: { type: Date, default: Date.now }
}, { _id: false }); // We don't need separate IDs for sub-documents

// --- Main Issue Schema ---
const IssueSchema = new mongoose.Schema({
    // REPORTER INFORMATION
    reporterEmail: { type: String, required: true, index: true },
    
    // ISSUE DETAILS (From Report Form)
    title: { type: String, required: true, trim: true, maxlength: 60 },
    description: { type: String, required: true, trim: true },
    category: { 
        type: String, 
        required: true, 
        // Based on issues mentioned in description
        enum: ['Pothole', 'Streetlight', 'Water Leakage', 'Garbage Overflow', 'Damaged Footpath', 'Other Infrastructure']
    },
    location: { type: String, required: true, trim: true },
    imageUrl: { type: String, default: null }, // Optional image URL
    
    // TRACKING INFORMATION
    status: { 
        type: String, 
        required: true, 
        default: 'Pending',
        // System tracks status from Pending → In-Progress → Resolved → Closed
        enum: ['Pending', 'In-Progress', 'Working', 'Resolved', 'Closed', 'Rejected']
    },
    priority: { 
        type: String, 
        required: true, 
        default: 'Normal',
        enum: ['Normal', 'High'] // High for boosted issues
    },
    
    // ASSIGNMENT & INTERACTION
    assignedStaff: { type: String, default: null }, // Staff email (for backward compatibility)
    staffAssigned: {
        email: { type: String, default: null },
        name: { type: String, default: null }
    },
    upvotes: { 
        type: [String], // Array of user emails who upvoted
        default: []
    },
    
    // HISTORY
    timeline: { type: [TimelineSchema], default: [] }, // Tracking lifecycle history

    // Timestamps
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});


module.exports = mongoose.model('Issue', IssueSchema);