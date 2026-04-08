import { Timestamp } from "firebase/firestore";

export interface Transaction {
    id: string;
    date: string; // DD/MM/YYYY
    description: string;
    amount: number;
    type: "debit" | "credit";
    category: string;
}

export interface Statement {
    id: string;
    fileName: string;
    uploadedAt: Timestamp;
    status: string;
    sourceType?: string;
    transactionCount?: number;
    totalSpend?: number;
}

/**
 * Parses a date string in DD/MM/YYYY format or a Timestamp
 * Returns an object with month (0-11) and year.
 */
export function getMonthYear(dateInput: string | Timestamp) {
    if (typeof dateInput === "string") {
        const parts = dateInput.includes("/") ? dateInput.split("/") : dateInput.split("-");
        if (parts.length === 3) {
            const isYearFirst = parts[0].length === 4;
            const year = isYearFirst ? parseInt(parts[0]) : parseInt(parts[2]);
            const month = parseInt(parts[1]) - 1;
            const day = isYearFirst ? parseInt(parts[2]) : parseInt(parts[1]); // This was day: parseInt(parts[0]) but handle YYYY-MM-DD
            return {
                day: isYearFirst ? parseInt(parts[2]) : parseInt(parts[0]),
                month: parseInt(parts[1]) - 1,
                year: isYearFirst ? parseInt(parts[0]) : parseInt(parts[2])
            };
        }
    }
    if (dateInput instanceof Timestamp) {
        const d = dateInput.toDate();
        return {
            day: d.getDate(),
            month: d.getMonth(),
            year: d.getFullYear()
        };
    }
    return { day: 1, month: 0, year: 2026 };
}

/**
 * Groups statements by Year and then by Month
 */
export function groupStatementsByPeriod(statements: Statement[]) {
    const grouped: Record<number, Record<number, Statement[]>> = {};

    statements.forEach(stmt => {
        const { year, month } = getMonthYear(stmt.uploadedAt);
        if (!grouped[year]) grouped[year] = {};
        if (!grouped[year][month]) grouped[year][month] = [];
        grouped[year][month].push(stmt);
    });

    return grouped;
}

export const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

/**
 * Generates saving recommendations based on spending distribution
 */
export function getSavingRecommendations(
    categorySpend: Record<string, number>, 
    prevCategorySpend: Record<string, number>,
    merchantSpend: Record<string, number>,
    totalSpend: number,
    isAllTime: boolean
) {
    if (isAllTime || totalSpend <= 0) return [];

    const recommendations: { title: string; hint: string; amount: number }[] = [];
    
    // 1. Highest Discretionary
    const discretionary = ["Food & Dining", "Shopping", "Entertainment"];
    let highestDiscCat = "";
    let highestDiscAmt = 0;
    
    discretionary.forEach(cat => {
        const amt = categorySpend[cat] || 0;
        if (amt > highestDiscAmt) {
            highestDiscAmt = amt;
            highestDiscCat = cat;
        }
    });

    if (highestDiscAmt > totalSpend * 0.15) {
        const saved = Math.round(highestDiscAmt * 0.15);
        recommendations.push({
            title: `Optimize ${highestDiscCat}`,
            hint: `Reducing ${highestDiscCat} by 15% could save ₹${new Intl.NumberFormat('en-IN').format(saved)} this period.`,
            amount: saved
        });
    }

    // 2. MoM category spike
    let highestSpikeCat = "";
    let highestSpikeAmt = 0;
    Object.entries(categorySpend).forEach(([cat, amt]) => {
        const prevAmt = prevCategorySpend[cat] || 0;
        if (prevAmt > 0) {
            const surgePct = (amt - prevAmt) / prevAmt;
            if (surgePct > 0.20 && amt > totalSpend * 0.05) { 
                if (amt - prevAmt > highestSpikeAmt) {
                    highestSpikeAmt = amt - prevAmt;
                    highestSpikeCat = cat;
                }
            }
        }
    });

    if (highestSpikeAmt > 0 && highestSpikeCat !== highestDiscCat) {
        recommendations.push({
            title: `Cap ${highestSpikeCat}`,
            hint: `${highestSpikeCat} spiked over 20%. Normalizing it to previous levels saves ₹${new Intl.NumberFormat('en-IN').format(Math.round(highestSpikeAmt))}.`,
            amount: Math.round(highestSpikeAmt)
        });
    }

    // 3. Merchant dominating spend
    let highestMerch = "";
    let highestMerchAmt = 0;
    Object.entries(merchantSpend).forEach(([merch, amt]) => {
        if (!merch.toLowerCase().match(/bescom|electricity|rent|water|maintenance|investment|zerodha|groww/)) {
            if (amt > highestMerchAmt) {
                highestMerchAmt = amt;
                highestMerch = merch;
            }
        }
    });

    if (highestMerchAmt > totalSpend * 0.15) {
        const saved = Math.round(highestMerchAmt * 0.10);
        recommendations.push({
            title: `Vendor Dependency`,
            hint: `A 10% reduction at ${highestMerch} could save ₹${new Intl.NumberFormat('en-IN').format(saved)}.`,
            amount: saved
        });
    }

    return recommendations.sort((a,b) => b.amount - a.amount).slice(0, 3);
}

/**
 * Normalizes raw chaotic merchant names into clean, brand-formatted strings.
 */
export function normalizeMerchantName(rawDesc: string): string {
    if (!rawDesc) return "Unknown";
    
    let clean = rawDesc.toUpperCase();
    
    // Strip chaotic payment artifacts
    clean = clean.replace(/UPI-/, "")
        .replace(/TRANSFER FROM /, "")
        .replace(/TRANSFER TO /, "")
        .replace(/PURCHASE /, "")
        .replace(/ONLINE CARD PAYMENT TO CARD.*/, "Card Payment")
        .replace(/\/[0-9]+\/.*$/, "") // remove /12345/ref...
        .replace(/[0-9]{6,}/g, "") // remove long numeric IDs
        .replace(/IN$/, "")
        .replace(/BANGALORE$/, "")
        .replace(/\s\s+/g, " ") // normalize spacing
        .trim();

    // Specific Brand Overrides
    if (clean.includes("LULU INTERNATIONAL")) clean = "Lulu International";
    else if (clean.includes("THIRD WAVE COFFEE")) clean = "Third Wave Coffee";
    else if (clean.includes("CROSSWORD")) clean = "Crossword Bookstores";
    else if (clean.includes("AMRITH CAFE")) clean = "The Amrith Cafe";
    else if (clean.includes("ZOMATO")) clean = "Zomato";
    else if (clean.includes("SWIGGY")) clean = "Swiggy";
    else if (clean.includes("AMAZON")) clean = "Amazon";
    else if (clean.includes("FLIPKART")) clean = "Flipkart";
    else if (clean.includes("UBER")) clean = "Uber";
    else if (clean.includes("OLA")) clean = "Ola";
    else if (clean.includes("ZEPTO")) clean = "Zepto";
    else if (clean.includes("BLINKIT")) clean = "Blinkit";
    else if (clean.includes("STARBUCKS")) clean = "Starbucks";
    else {
        // Fallback: title case the remaining clean string
        clean = clean.split(' ').map(word => {
            if (word.length < 2) return word;
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        }).join(' ');
    }
    
    return clean || "Merchant";
}

/**
 * Returns a strict matching category based on the normalized merchant name.
 */
export function enrichCategory(merchant: string, fallbackCategory: string = "Uncategorized"): string {
    const m = merchant.toLowerCase();
    
    if (m.match(/zomato|swiggy|cafe|coffee|restaurant|eat|starbucks|mcdonald|kfc|pizza|burger|amrith|dining|bakery/)) {
        return "Food & Dining";
    }
    if (m.match(/blinkit|zepto|bigbasket|grocery|supermarket|dmart|freshtohome|instamart|nature.s basket|lulu/)) {
        return "Groceries";
    }
    if (m.match(/uber|ola|rapido|petrol|fuel|metro|shell|hpcl|iocl|indian oil|namma metro|irctc|makemytrip|indigo/)) {
        return "Travel";
    }
    if (m.match(/amazon|flipkart|retail|mall|shoppers stop|crossword|myntra|ajio|zara|h&m|nike|puma/)) {
        return "Shopping";
    }
    if (m.match(/rent|electricity|bescom|water|maintenance|airtel|jio|vi|broadband|recharge/)) {
        return "Bills & Utilities";
    }
    if (m.match(/card payment|transfer|atm|cash withdrawal|razorpay|payu|cred/)) {
        return "Transfers & Payments";
    }
    if (m.match(/investment|mutual fund|zerodha|groww|sip|upstox/)) {
        return "Investments";
    }
    
    return fallbackCategory;
}

/**
 * Detects recurring transactions by extracting historical mapping and monitoring stable variance
 * across multiple independent months.
 */
export function detectRecurring(transactions: any[]) {
    const merchHistory: Record<string, { amounts: number[], months: Set<string>, category: string }> = {};

    transactions.forEach(tx => {
        const amt = tx.amount || 0;
        const normalized = normalizeMerchantName(tx.originalDescription || tx.description);
        const cat = enrichCategory(normalized, tx.category);
        const { year, month } = getMonthYear(tx.date);

        if (!merchHistory[normalized]) {
            merchHistory[normalized] = { amounts: [], months: new Set(), category: cat };
        }
        merchHistory[normalized].amounts.push(amt);
        merchHistory[normalized].months.add(`${year}-${month}`);
    });

    const recurring: { merchant: string; amount: number; frequency: string; category: string }[] = [];

    Object.entries(merchHistory).forEach(([merchant, data]) => {
        // Must appear in at least 2 distinct calendar months
        if (data.months.size >= 2) {
            const avg = data.amounts.reduce((a,b) => a+b, 0) / data.amounts.length;
            
            // Allow ~15% deviation for price fluctuation mapping
            let isStable = true;
            for (const amt of data.amounts) {
                if (Math.abs(amt - avg) > avg * 0.15) { 
                    isStable = false; 
                    break;
                }
            }

            if (isStable) {
                recurring.push({
                    merchant,
                    amount: Math.round(avg),
                    frequency: 'Monthly',
                    category: data.category
                });
            }
        }
    });

    return recurring.sort((a, b) => b.amount - a.amount);
}

/**
 * Extracts deep behavioral correlations from raw unfiltered transaction arrays mapped dynamically
 * against strict calendar parameters and velocity structures.
 */
export function getBehavioralInsights(activeDebits: any[], totalSpend: number, catMap: Record<string, number>): string[] {
    const insights: string[] = [];
    if (activeDebits.length === 0 || totalSpend === 0) return insights;

    let weekendSpend = 0;
    let weekdaySpend = 0;
    let firstHalfSpend = 0;
    let secondHalfSpend = 0;
    let microCount = 0;
    let microTotal = 0;

    const weekendDaysSet = new Set<string>();
    const weekdayDaysSet = new Set<string>();

    activeDebits.forEach(tx => {
        const amt = tx.amount || 0;
        const { day, month, year } = getMonthYear(tx.date);
        
        const safeDay = day || 1;
        // Construct native date securely using bounded integer params to avoid string parse panics
        const d = new Date(year, month, safeDay);
        
        const dayOfWeek = d.getDay(); 
        const dateCode = `${year}-${String(month).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
        
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            weekendSpend += amt;
            weekendDaysSet.add(dateCode);
        } else {
            weekdaySpend += amt;
            weekdayDaysSet.add(dateCode);
        }

        if (safeDay <= 15) {
            firstHalfSpend += amt;
        } else {
            secondHalfSpend += amt;
        }

        if (amt > 0 && amt <= 500) {
            microCount++;
            microTotal += amt;
        }
    });

    // Strategy 1: Weekend Velocity
    const weekendDays = weekendDaysSet.size || 1;
    const weekdayDays = weekdayDaysSet.size || 1;
    
    const avgWeekend = weekendSpend / weekendDays;
    const avgWeekday = weekdaySpend / weekdayDays;

    if (avgWeekend > avgWeekday * 1.3 && weekendDaysSet.size > 0 && weekdayDaysSet.size > 0) {
        const diff = Math.round(((avgWeekend - avgWeekday) / avgWeekday) * 100);
        insights.push(`Your weekend spending velocity runs ${diff}% higher dynamically than mid-week averages.`);
    }

    // Strategy 2: Load Fronting
    if (firstHalfSpend > secondHalfSpend * 1.5 && firstHalfSpend > 0) {
        insights.push(`Spending is heavily concentrated in the first 15 days of the cycle, driving ${Math.round((firstHalfSpend/totalSpend)*100)}% of volume.`);
    } else if (secondHalfSpend > firstHalfSpend * 1.5 && secondHalfSpend > 0) {
        insights.push(`Cash flow organically backloads into the final half of the cycle, mapping ${Math.round((secondHalfSpend/totalSpend)*100)}% of volume.`);
    }

    // Strategy 3: Microtransaction Anomalies
    if (microCount >= 10 && microTotal > 0) {
        const pct = Math.round((microTotal / totalSpend) * 100);
        if (pct > 5) {
            insights.push(`Microtransactions (≤₹500) quietly drained ${pct}% of outflow via ${microCount} distinct charges.`);
        }
    }

    // Strategy 4: High-Velocity Variable Outflows
    const discKeys = ['Shopping', 'Food & Dining', 'Entertainment'];
    let dominantDisc = { name: '', amt: 0 };
    discKeys.forEach(k => {
        if ((catMap[k] || 0) > dominantDisc.amt) {
            dominantDisc = { name: k, amt: catMap[k] };
        }
    });

    if (dominantDisc.amt > totalSpend * 0.15) {
        insights.push(`${dominantDisc.name} acts as your primary variable sink, dominating ${Math.round((dominantDisc.amt / totalSpend) * 100)}% of total spend.`);
    }

    return insights;
}
