import twilio from "twilio";
import { adminDb } from "@/lib/firebase-admin";
import { normalizeMerchantName, enrichCategory, getSavingRecommendations, getMonthYear } from "@/lib/finance-utils";

/**
 * Generates a formatted financial summary message for a user.
 * @param uid The unique identifier for the user in Firestore.
 */
export async function generateUserSummary(uid: string): Promise<string> {
    const db = adminDb;
    if (!db) throw new Error("Firebase Admin database is not initialized.");

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // 1. Fetch Transactions (Debits) for the user
    // Fetch all user debits and filter for current month/year.
    const txSnap = await db.collection("transactions")
        .where("userId", "==", uid)
        .where("type", "==", "debit")
        .get();

    let totalSpend = 0;
    const catMap: Record<string, number> = {};
    const merchMap: Record<string, number> = {};

    txSnap.forEach(doc => {
        const data = doc.data();
        const { month, year } = getMonthYear(data.date);

        if (month === currentMonth && year === currentYear) {
            const amt = data.amount || 0;
            const cleanMerchant = normalizeMerchantName(data.originalDescription || data.description);
            const cleanCat = enrichCategory(cleanMerchant, data.category);

            totalSpend += amt;
            catMap[cleanCat] = (catMap[cleanCat] || 0) + amt;
            merchMap[cleanMerchant] = (merchMap[cleanMerchant] || 0) + amt;
        }
    });

    // 2. Fetch Budget
    const budgetSnap = await db.collection("budgets")
        .where("userId", "==", uid)
        .get();
    let totalBudget = 0;
    budgetSnap.forEach(doc => {
        totalBudget += (doc.data().amount || 0);
    });

    // 3. Fetch Active Alerts
    const alertsSnap = await db.collection("alerts")
        .where("userId", "==", uid)
        .where("status", "==", "active")
        .get();
    const alertsCount = alertsSnap.size;

    // 4. Summarize Insight Metrics
    const sortedCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
    const topCategory = sortedCats.length > 0 ? sortedCats[0][0] : "None";

    const sortedMerchs = Object.entries(merchMap).sort((a, b) => b[1] - a[1]);
    const topMerchant = sortedMerchs.length > 0 ? sortedMerchs[0][0] : "None";

    // Recommendations (Step 2 logic: empty historical data for simplicity)
    const recommendations = getSavingRecommendations(catMap, {}, merchMap, totalSpend, false);
    const savingsOpportunity = recommendations.length > 0
        ? `${recommendations[0].title}: ${recommendations[0].hint}`
        : "No specific structural savings identified.";

    // 5. Format the message
    const formatCurrency = (val: number) => `₹${new Intl.NumberFormat('en-IN').format(Math.round(val))}`;

    return `Financial Intelligence Summary

Total Spend: ${formatCurrency(totalSpend)}
Budget: ${formatCurrency(totalBudget)}
Alerts: ${alertsCount}
Top Category: ${topCategory}
Top Merchant: ${topMerchant}
Savings Opportunity: ${savingsOpportunity}`;
}

/**
 * Sends a financial summary via WhatsApp to recipients configured for a user.
 * @param uid The unique identifier for the user.
 * @param summary The pre-formatted summary text to send.
 */
export async function sendSummaryToWhatsApp(uid: string, summary: string): Promise<{ success: boolean; sentCount: number; failCount: number }> {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_WHATSAPP_FROM;
    const toRaw = process.env.TWILIO_WHATSAPP_TO;

    // Debug logging to identify missing variables
    console.log("🔍 Twilio config check:", {
        hasAccountSid: !!accountSid,
        hasAuthToken: !!authToken,
        hasFrom: !!from,
        hasTo: !!toRaw,
        accountSidLength: accountSid?.length,
        authTokenLength: authToken?.length,
        fromValue: from,
        toValue: toRaw
    });

    if (!accountSid || !authToken || !from || !toRaw) {
        const missing = [];
        if (!accountSid) missing.push("TWILIO_ACCOUNT_SID");
        if (!authToken) missing.push("TWILIO_AUTH_TOKEN");
        if (!from) missing.push("TWILIO_WHATSAPP_FROM");
        if (!toRaw) missing.push("TWILIO_WHATSAPP_TO");

        console.error("❌ Missing Twilio credentials:", missing);
        throw new Error(`Twilio credentials not configured. Missing: ${missing.join(", ")}`);
    }

    const client = twilio(accountSid, authToken);
    const toNumbers = toRaw.split(",").map(num => num.trim()).filter(Boolean);
    let successCount = 0;
    let failCount = 0;

    for (const to of toNumbers) {
        try {
            await client.messages.create({
                body: summary,
                from,
                to
            });
            successCount++;
        } catch (error) {
            console.error(`Twilio error for ${to}:`, error);
            failCount++;
        }
    }

    return {
        success: successCount > 0,
        sentCount: successCount,
        failCount
    };
}