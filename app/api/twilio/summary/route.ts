import { generateUserSummary, sendSummaryToWhatsApp } from "@/lib/summary-service";
import { withErrorHandler, successResponse, errorResponse } from "@/lib/api-response";

async function weeklySummaryHandler(request: Request) {
    console.log("➡️ /api/automation/weekly-summary called");

    const authHeader = request.headers.get("authorization");

    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return errorResponse("Unauthorized", 401);
    }

    const uid = process.env.WEEKLY_SUMMARY_USER_ID;

    if (!uid) {
        throw new Error("Missing WEEKLY_SUMMARY_USER_ID in environment variables.");
    }

    console.log("✅ Cron authorized");
    console.log("➡️ Generating weekly summary for uid:", uid);

    const message = await generateUserSummary(uid);

    console.log("➡️ Sending WhatsApp weekly summary...");
    const result = await sendSummaryToWhatsApp(uid, message);

    return successResponse(result, "Weekly summary sent.");
}

export const GET = withErrorHandler(weeklySummaryHandler);