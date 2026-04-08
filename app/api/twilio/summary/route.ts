import { NextResponse } from "next/server";
import { generateUserSummary, sendSummaryToWhatsApp } from "@/lib/summary-service";
import { verifyAuthToken } from "@/lib/auth-utils";
import { withErrorHandler, successResponse } from "@/lib/api-response";

async function twilioSummaryHandler(request: Request) {
    console.log("➡️ /api/twilio/summary called");

    // 1. Verify Authentication
    const uid = await verifyAuthToken(request);
    console.log("✅ Token verified for uid:", uid);

    // 2. Generate and Send Summary
    console.log("➡️ Generating summary...");
    const message = await generateUserSummary(uid);

    console.log("➡️ Sending WhatsApp summary...");
    const result = await sendSummaryToWhatsApp(uid, message);

    return successResponse(result, "Summary sent successfully.");
}

export const POST = withErrorHandler(twilioSummaryHandler);