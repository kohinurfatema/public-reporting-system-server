// src/config/firebase.js

const admin = require('firebase-admin');
const path = require('path');

const initializeFirebase = () => {
    if (admin.apps.length > 0) {
        return admin;
    }

    try {
        // Use the service account JSON file
        const serviceAccount = require('../public-reporting-system-firebase-adminsdk.json');

        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log('[firebase] Admin SDK initialized');
    } catch (error) {
        console.error('[firebase] Initialization error:', error.message);
    }

    return admin;
};

module.exports = { initializeFirebase, admin };
