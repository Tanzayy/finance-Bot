import * as admin from "firebase-admin";

/**
 * Initializes Firebase Admin SDK once.
 * Safe for Next.js server routes.
 */
function initAdmin() {
    if (admin.apps.length > 0) {
        return;
    }

    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;

    // Fix escaped newlines from .env.local
    if (privateKey) {
        privateKey = privateKey.replace(/\\n/g, "\n").replace(/^"|"$/g, "");
    }

    // Validate env vars before initializing
    if (!projectId || !clientEmail || !privateKey) {
        console.error("❌ Firebase Admin env vars missing.");
        console.error("projectId exists:", !!projectId);
        console.error("clientEmail exists:", !!clientEmail);
        console.error("privateKey exists:", !!privateKey);
        return;
    }

    try {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId,
                clientEmail,
                privateKey,
            }),
        });

        console.log("✅ Firebase Admin initialized successfully.");
    } catch (error) {
        console.error("❌ Firebase Admin initialization failed:", error);
    }
}

initAdmin();

export const adminDb = admin.apps.length > 0 ? admin.firestore() : null;
export const adminAuth = admin.apps.length > 0 ? admin.auth() : null;
export default admin;