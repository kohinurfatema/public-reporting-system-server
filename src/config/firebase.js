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
        console.log('[firebase] Admin SDK initialized for project:', serviceAccount.project_id);
    } catch (error) {
        console.error('[firebase] Initialization error:', error.message);
        console.error('[firebase] Make sure the service account JSON file exists and is valid');
    }

    return admin;
};

module.exports = { initializeFirebase, admin };
