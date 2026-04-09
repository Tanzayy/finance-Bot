import { NextResponse } from "next/server";
import { generateUserSummary, sendSummaryToWhatsApp } from "@/lib/summary-service";
import { verifyAutomationSecret } from "@/lib/auth-utils";
import { withErrorHandler, successResponse, errorResponse } from "@/lib/api-response";

async function automationSummaryHandler(request: Request) {
    // 1. Verify Authentication Secret
    verifyAutomationSecret(request);

    // 2. Extract payload safely
    let userId: string | null = null;
    
    if (request.method === "POST") {
        try {
            const body = await request.json();
            userId = body.userId;
        } catch (e) {
            return errorResponse("Invalid JSON payload.", 400);
        }
    } else if (request.method === "GET") {
        const { searchParams } = new URL(request.url);
        userId = searchParams.get("userId");
    }

    if (!userId || typeof userId !== 'string') {
        return errorResponse("Missing or invalid Target User ID in request.", 400);
    }

    // 3. Execute the summary process
    console.log(`[Automation] Triggering summary for user: ${userId}`);
    await generateUserSummary(userId).then(message => sendSummaryToWhatsApp(userId, message));

    return NextResponse.json({ success: true });
}

export const POST = withErrorHandler(automationSummaryHandler);
export const GET = withErrorHandler(automationSummaryHandler);
