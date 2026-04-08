import { adminAuth } from "@/lib/firebase-admin";

/**
 * Verifies the Firebase ID Token from the Authorization header.
 * @throws {Error} if token is missing, invalid, or adminAuth is unavailable.
 * @returns {Promise<string>} The authenticated user's UID.
 */
export async function verifyAuthToken(request: Request): Promise<string> {
    const authHeader = request.headers.get("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        const err: any = new Error("Unauthorized access. No token provided.");
        err.status = 401;
        throw err;
    }

    const idToken = authHeader.replace("Bearer ", "").trim();

    if (!adminAuth) {
        console.error("❌ adminAuth is null. Firebase Admin not initialized.");
        const err: any = new Error("Firebase Admin Auth service is unavailable.");
        err.status = 500;
        throw err;
    }

    try {
        const decodedToken = await adminAuth.verifyIdToken(idToken);
        return decodedToken.uid;
    } catch (authError: any) {
        console.error("❌ Token verification failed:", authError.message);
        const err: any = new Error("Invalid session or authentication token.");
        err.status = 401;
        throw err;
    }
}

/**
 * Verifies the internal automation secret for CRON jobs and background tasks.
 * It checks the process.env.AUTOMATION_SECRET strictly.
 * @throws {Error} if the secret does not match.
 */
export function verifyAutomationSecret(request: Request): void {
    const automationSecret = process.env.AUTOMATION_SECRET;

    if (!automationSecret) {
        console.error("❌ process.env.AUTOMATION_SECRET is not set.");
        const err: any = new Error("Server automation configuration error.");
        err.status = 500;
        throw err;
    }

    const secretHeader = request.headers.get("x-automation-secret");

    if (!secretHeader || secretHeader !== automationSecret) {
        console.warn("⚠️ Unauthorized automation attempt detected.");
        const err: any = new Error("Unauthorized access. Invalid or missing automation secret.");
        err.status = 401;
        throw err;
    }
}
