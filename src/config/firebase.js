// src/config/firebase.js

const admin = require('firebase-admin');

const initializeFirebase = () => {
    if (admin.apps.length > 0) {
        return admin;
    }

    try {
        let serviceAccount;

        // Check if running on Vercel/production with base64 encoded service key
        if (process.env.FB_SERVICE_KEY) {
            const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf8');
            serviceAccount = JSON.parse(decoded);
            console.log('[firebase] Using base64 decoded credentials from FB_SERVICE_KEY');
        } else {
            // Fallback to JSON file for local development
            serviceAccount = require('../public-reporting-system-firebase-adminsdk.json');
            console.log('[firebase] Using JSON file for credentials');
        }

        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log('[firebase] Admin SDK initialized for project:', serviceAccount.project_id);
    } catch (error) {
        console.error('[firebase] Initialization error:', error.message);
        console.error('[firebase] Make sure the service account JSON file exists or FB_SERVICE_KEY env var is set');
    }

    return admin;
};

module.exports = { initializeFirebase, admin };
