const express = require('express');
const router = express.Router();
const Contact = require('../models/Contact');

// POST /contact - Save a contact form submission
router.post('/', async (req, res) => {
    const { name, email, subject, message } = req.body;

    if (!name || !email || !subject || !message) {
        return res.status(400).json({ message: 'All fields are required.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ message: 'Invalid email address.' });
    }

    if (message.length < 10) {
        return res.status(400).json({ message: 'Message must be at least 10 characters.' });
    }

    try {
        const contact = new Contact({ name, email, subject, message });
        await contact.save();
        res.status(201).json({ message: 'Message received. We will get back to you soon.' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to save your message. Please try again.' });
    }
});

module.exports = router;
