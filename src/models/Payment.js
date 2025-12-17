// src/models/Payment.js

const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    userEmail: {
        type: String,
        required: true,
        index: true
    },
    userName: {
        type: String,
        required: true
    },
    userPhoto: {
        type: String,
        default: null
    },
    type: {
        type: String,
        enum: ['boost', 'subscription'],
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    issueId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Issue',
        default: null // Only for boost payments
    },
    issueTitle: {
        type: String,
        default: null
    },
    transactionId: {
        type: String,
        default: function() {
            return 'TXN' + Date.now() + Math.random().toString(36).substr(2, 9).toUpperCase();
        }
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed'],
        default: 'completed'
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Payment', paymentSchema);
