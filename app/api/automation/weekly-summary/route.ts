import { NextResponse } from "next/server";
import { generateUserSummary, sendSummaryToWhatsApp } from "@/lib/summary-service";
import { verifyAutomationSecret } from "@/lib/auth-utils";
import { withErrorHandler, successResponse, errorResponse } from "@/lib/api-response";

async function automationSummaryHandler(request: Request) {
    // 1. Verify Authentication Secret
    verifyAutomationSecret(request);

    // 2. Extract payload safely
    let userId;
    try {
        const body = await request.json();
        userId = body.userId;
    } catch (e) {
        return errorResponse("Invalid JSON payload.", 400);
    }

    if (!userId || typeof userId !== 'string') {
        return errorResponse("Missing or invalid Target User ID in payload.", 400);
    }

    // 3. Execute the summary process
    console.log(`[Automation] Triggering summary for user: ${userId}`);
    const message = await generateUserSummary(userId);
    const result = await sendSummaryToWhatsApp(userId, message);

    return successResponse({ result }, "Weekly summary automation completed successfully.");
}

export const POST = withErrorHandler(automationSummaryHandler);
