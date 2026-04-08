import { NextResponse } from "next/server";
// @ts-ignore - CommonJS vs ESM overlap
import pdfParse from "pdf-parse";
import { verifyAuthToken } from "@/lib/auth-utils";
import { withErrorHandler, successResponse, errorResponse } from "@/lib/api-response";

async function parseHandler(req: Request) {
    // 1. Authenticate user to prevent abuse
    await verifyAuthToken(req);

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
        return errorResponse("No file provided", 400);
    }

    // Extract raw bytes from the file
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let data;
    try {
        // @ts-ignore
        data = await (pdfParse as any)(buffer);
    } catch (parseError) {
        console.error("PDF parse error:", parseError);
        return errorResponse("Corrupted or invalid PDF format. Extraction failed.", 400);
    }

    // Basic Content Validation Heuristics for Bank Statements
    const text = data.text.toLowerCase();
    const bankingKeywords = ["statement", "account", "balance", "transaction", "deposit", "withdrawal"];
    
    const hasBankingKeywords = bankingKeywords.some((keyword) => text.includes(keyword));

    if (!hasBankingKeywords) {
        return errorResponse("not a bank statement", 400);
    }

    // --- NEW: PDF Transaction Extraction (Robust) ---
    const transactions: any[] = [];
    const seen = new Set<string>();

    // 1. Unified Regex for Dates (supports DD/MM/YYYY, DD-MM-YYYY, DD MMM YYYY, DD-MMM-YYYY)
    const dateRegex = /(\d{1,2}[\/\-\s](?:\d{1,2}|JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[\/\-\s]\d{4})/gi;
    
    // 2. Regex for Amounts (matches numbers with 2 decimals, handles commas)
    const amountRegex = /(?:INR|RS|₹)?\s?([\d,]+\.\d{2})/gi;

    const lines = data.text.split("\n");
    for (const line of lines) {
        if (transactions.length >= 25) break;

        const dateMatch = line.match(dateRegex);
        const amountMatches = [...line.matchAll(amountRegex)];

        if (dateMatch && amountMatches.length > 0) {
            const dateRaw = dateMatch[0].trim().replace(/[\/\-\s]/g, '/');
            
            // Use the last amount in the line (usually the debit/credit amount, not the balance)
            const lastAmountMatch = amountMatches[amountMatches.length - 1];
            const amountStr = lastAmountMatch[1].replace(/,/g, "");
            const amount = parseFloat(amountStr);

            if (!isNaN(amount) && amount > 0) {
                const uniqueKey = `${dateRaw}_${amount}`;
                if (!seen.has(uniqueKey)) {
                    transactions.push({
                        date: dateRaw,
                        description: "Statement Transaction",
                        amount: amount,
                        type: "debit"
                    });
                    seen.add(uniqueKey);
                }
            }
        }
    }

    console.log(`[Parser] Extracted ${transactions.length} transactions from PDF.`);

    return successResponse(
        {
            pages: data.numpages,
            transactions: transactions,
            transactionCount: transactions.length
        },
        "PDF statement processed successfully."
    );
}

export const POST = withErrorHandler(parseHandler);
