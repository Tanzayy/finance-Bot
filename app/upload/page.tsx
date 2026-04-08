"use client";

import { useRef, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { auth, db } from "@/lib/firebase";
import { collection, query, where, getDocs, addDoc, serverTimestamp, writeBatch, doc } from "firebase/firestore";
import Papa from "papaparse";
import { normalizeMerchantName, enrichCategory } from "@/lib/finance-utils";

const MAX_FILE_SIZE_MB = 5;

export default function UploadPage() {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const validateFile = (file: File) => {
        const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
        const isCsv = file.type === "text/csv" || file.name.toLowerCase().endsWith(".csv") || file.type === "application/vnd.ms-excel";

        if (!isPdf && !isCsv) {
            return "Only PDF or CSV files are allowed.";
        }

        const validKeywords = ["statement", "stmt", "bank", "account", "transaction", "txn"];
        const hasValidKeyword = validKeywords.some(keyword => file.name.toLowerCase().includes(keyword));
        if (!hasValidKeyword) {
            return "not a bank statement";
        }

        const maxBytes = MAX_FILE_SIZE_MB * 1024 * 1024;
        if (file.size > maxBytes) {
            return `File size must be under ${MAX_FILE_SIZE_MB} MB.`;
        }

        return "";
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setError("");
        setSuccess("");

        const file = e.target.files?.[0];
        if (!file) {
            setSelectedFile(null);
            return;
        }

        const validationError = validateFile(file);
        if (validationError) {
            setSelectedFile(null);
            setError(validationError);
            if (inputRef.current) inputRef.current.value = "";
            return;
        }

        setSelectedFile(file);
    };

    const [isUploading, setIsUploading] = useState(false);
    const [duplicateMessage, setDuplicateMessage] = useState("");

    const generateFingerprint = (file: File, userId: string) => {
        // Strict V1 fingerprint
        const fingerprint = `v1_user:${userId}_name:${file.name}_size:${file.size}`;
        console.log("[DuplicateCheck] Generated fingerprint:", fingerprint);
        return fingerprint;
    };



    const handleUpload = async () => {
        setError("");
        setSuccess("");
        setDuplicateMessage("");
        console.log("[Upload] Starting new upload process...");

        if (!selectedFile) {
            setError("Please select a valid PDF or CSV bank statement first.");
            return;
        }

        const user = auth.currentUser;
        if (!user) {
            console.error("[Upload] Error: No authenticated user found.");
            setError("You must be logged in to upload statements.");
            return;
        }

        console.log(`[Upload] Processing ${selectedFile.name} for user: ${user.uid}`);

        setIsUploading(true);
        try {
            const fingerprint = generateFingerprint(selectedFile, user.uid);

            // 1. Check for duplicates
            const qDup = query(
                collection(db, "statements"),
                where("userId", "==", user.uid),
                where("fingerprint", "==", fingerprint)
            );
            
            console.log("[DuplicateCheck] Querying Firestore for fingerprint...");
            const dupSnapshot = await getDocs(qDup);
            
            if (!dupSnapshot.empty) {
                console.log("[DuplicateCheck] DUPLICATE FOUND! Blocking upload for:", selectedFile.name);
                setDuplicateMessage("This statement has already been processed.");
                setIsUploading(false);
                return;
            }
            
            console.log("[DuplicateCheck] No existing record found. Proceeding with upload.");

            const isCsv = selectedFile.name.toLowerCase().endsWith(".csv");

            if (isCsv) {
                const text = await selectedFile.text();
                const parseResult = Papa.parse(text, {
                    skipEmptyLines: true,
                    // Note: header: true is off because bank CSVs often have summary stats on rows 1-5 before the table.
                });

                if (parseResult.errors.length > 0) {
                    console.warn("CSV Parse warnings:", parseResult.errors);
                }

                const rawRows = parseResult.data as string[][];
                
                let headerRowIndex = -1;
                let cDate = -1, cDesc = -1, cAmt = -1, cCred = -1, cDeb = -1;
                let fallbackDate = "01/01/2026"; // Default

                // 1. Scan first 10 rows for a date period (e.g. 31/12/2025 To 01/01/2026)
                // We take the LATEST date found to ensure crossover files (Dec/Jan) attribute to the current period correctly.
                for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
                    const rowText = rawRows[i].join(" ");
                    const dateMatches = rowText.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/g);
                    if (dateMatches) {
                        // Take the last date in the line (which is usually the end-of-period date)
                        fallbackDate = dateMatches[dateMatches.length - 1].replace(/-/g, "/");
                        console.log(`[Upload] Found latest period date as fallback: ${fallbackDate}`);
                        // Don't break yet, keep looking for a later date in subsequent header rows
                    }
                }

                // 1. Scan rows to find the actual table header
                for (let i = 0; i < rawRows.length; i++) {
                    const row = rawRows[i];
                    for (let j = 0; j < row.length; j++) {
                        const cell = row[j].toLowerCase().trim();
                        
                        if (cell === "date" || cell.includes("posted") || cell === "txn date") {
                            cDate = j;
                        } else if (cell.includes("desc") || cell.includes("narration") || cell.includes("particular") || cell.includes("trans")) {
                            cDesc = j;
                        } else if (cell.includes("withdrawal") || cell.includes("debit") || cell.includes("paid out") || cell.match(/^dr$/)) {
                            cDeb = j;
                        } else if (cell.includes("deposit") || cell.includes("credit") || cell.includes("paid in") || cell.match(/^cr$/)) {
                            cCred = j;
                        } else if (cell === "amount" || cell === "amt" || cell === "value") {
                            cAmt = j;
                        } else if (cell.includes("balance") && cAmt === -1) {
                            // Only use balance as amount if we haven't found a better candidate
                            cAmt = j;
                        }
                    }
                    
                    // If we found Description and some Amount column, this is the header row
                    // (Relaxed requirement: Date column is optional)
                    if (cDesc !== -1 && (cAmt !== -1 || cCred !== -1 || cDeb !== -1)) {
                        headerRowIndex = i;
                        console.log(`[Upload] Header found at row ${i+1}. Columns: Date(${cDate}), Desc(${cDesc}), Amt(${cAmt}), Deb(${cDeb}), Cred(${cCred})`);
                        break;
                    } else {
                        // Reset if we haven't found a complete set yet
                        cDate = -1; cDesc = -1; cAmt = -1; cCred = -1; cDeb = -1;
                    }
                }

                if (headerRowIndex === -1) {
                    const safePreview = rawRows.slice(0, 3).map(r => r.join(" | ")).join(" \n ");
                    throw new Error(`Could not identify statement headers. Data seen: ${safePreview.substring(0, 150)}...`);
                }

                const statementRef = doc(collection(db, "statements"));
                console.log(`[Upload] Created statement record ID: ${statementRef.id}`);
                const batch = writeBatch(db);
                
                let transactionCount = 0;
                let totalSpend = 0;

                // 2. Parse from the header onwards
                for (let i = headerRowIndex + 1; i < rawRows.length; i++) {
                    const row = rawRows[i];
                    // Skip short junk rows
                    if (row.length <= Math.max(cDate, cDesc)) continue;

                    // Fallback to header date if row-level date is missing/empty
                    let dateStr = cDate !== -1 ? row[cDate] : "";
                    if (!dateStr || dateStr.trim() === "") {
                        dateStr = fallbackDate;
                    }
                    const descStr = row[cDesc];
                    if (!descStr) continue;

                    // Skip summary/junk rows
                    const lowerDesc = descStr.toLowerCase();
                    if (lowerDesc.includes("balance") || 
                        lowerDesc.includes("opening") || 
                        lowerDesc.includes("closing") || 
                        lowerDesc.includes("account no") || 
                        lowerDesc.includes("generated on") ||
                        lowerDesc.includes("statement period") ||
                        lowerDesc.includes("total withdrawals") ||
                        lowerDesc.includes("total deposits")) {
                        console.log("[Upload] Skipping summary/junk row:", descStr);
                        continue;
                    }

                    let amountStr = "";
                    let type = "debit";

                    // Single amount column vs split credit/debit columns
                    if (cDeb !== -1 && row[cDeb] && row[cDeb].trim() !== "" && row[cDeb] !== "0" && row[cDeb] !== "0.00") {
                        amountStr = row[cDeb];
                        type = "debit";
                    } else if (cCred !== -1 && row[cCred] && row[cCred].trim() !== "" && row[cCred] !== "0" && row[cCred] !== "0.00") {
                        amountStr = row[cCred];
                        type = "credit";
                    } else if (cAmt !== -1 && row[cAmt] && row[cAmt].trim() !== "") {
                        amountStr = row[cAmt];
                    }

                    if (amountStr && typeof amountStr === 'string') {
                        // strip currencies & commas, preserve minus
                        const cleanAmountStr = amountStr.replace(/[^0-9.-]/g, '');
                        const parsedNum = parseFloat(cleanAmountStr);
                        
                        if (!isNaN(parsedNum) && parsedNum !== 0) {
                            if (cAmt !== -1 && cDeb === -1 && cCred === -1) {
                                type = parsedNum >= 0 ? "credit" : "debit";
                            }
                            
                            const merchantName = normalizeMerchantName(descStr);
                            const category = enrichCategory(merchantName);
                            
                            // Directional logic refinement: check for CR/DR in description if single column
                            if (cAmt !== -1 && cDeb === -1 && cCred === -1) {
                                if (descStr.toUpperCase().includes(" CR ")) {
                                    type = "credit";
                                } else if (descStr.toUpperCase().includes(" DR ")) {
                                    type = "debit";
                                }
                            }

                            const txRef = doc(collection(db, "transactions"));
                            console.log(`[Upload] Saving ${type}: ${merchantName} - ₹${Math.abs(parsedNum)} [${category}]`);
                            
                            batch.set(txRef, {
                                statementId: statementRef.id,
                                userId: user.uid,
                                date: dateStr.trim(),
                                description: merchantName,
                                originalDescription: descStr.trim(),
                                amount: Math.abs(parsedNum),
                                type,
                                category,
                                createdAt: serverTimestamp()
                            });
                            if (type === "debit") {
                                totalSpend += Math.abs(parsedNum);
                            }
                            
                            transactionCount++;
                        }
                    }
                }

                if (transactionCount === 0) {
                    throw new Error("Successfully found headers, but failed to find any valid transaction rows below it.");
                }

                batch.set(statementRef, {
                    userId: user.uid,
                    fileName: selectedFile.name,
                    status: "processed",
                    transactionCount,
                    totalSpend,
                    sourceType: "csv",
                    fingerprint,
                    uploadedAt: serverTimestamp(),
                });

                console.log(`[Upload] Committing batch write for CSV (Total transactions: ${transactionCount})...`);
                await batch.commit();
                console.log("[Upload] SUCCESS: CSV batch commit successful. Data should be visible in Firestore.");

            } else {
                // STEP 1: Secure Content Validation via API (PDF)
                const formData = new FormData();
                formData.append("file", selectedFile);

                const idToken = await user.getIdToken();
                const parseRes = await fetch("/api/parse", {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${idToken}`
                    },
                    body: formData,
                });

                if (!parseRes.ok) {
                    const errorData = await parseRes.json();
                    throw new Error(errorData.error || "Failed to validate statement on server.");
                }

                // STEP 2: Save to Firestore
                const result = await parseRes.json();
                const statementRef = doc(collection(db, "statements"));
                const batch = writeBatch(db);
                
                let transactionCount = 0;
                let totalSpend = 0;
                
                if (result.transactions && Array.isArray(result.transactions)) {
                    result.transactions.forEach((tx: any) => {
                        const txRef = doc(collection(db, "transactions"));
                        batch.set(txRef, {
                            ...tx,
                            statementId: statementRef.id,
                            userId: user.uid,
                            category: "Uncategorized", // PDF extraction doesn't categorize yet
                            createdAt: serverTimestamp()
                        });
                        if (tx.type === "debit") {
                            totalSpend += (tx.amount || 0);
                        }
                        transactionCount++;
                    });
                }

                batch.set(statementRef, {
                    userId: user.uid,
                    fileName: selectedFile.name,
                    status: "processed",
                    sourceType: "pdf",
                    fingerprint,
                    transactionCount,
                    totalSpend,
                    uploadedAt: serverTimestamp(),
                });
                
                console.log(`[Upload] Saving ${transactionCount} PDF transactions...`);
                await batch.commit();
            }

            setSuccess(`Success! Statement processed.`);
            setSelectedFile(null);
            if (inputRef.current) inputRef.current.value = "";
        } catch (err: any) {
            console.error("Upload/Validation error:", err);
            setError(err.message || "Failed to process statement record. Please try again.");
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <main className="page-main">
            <div className="page-content">
                <PageHeader
                    title="Add Statement"
                />

                {/* Upload Card */}
                <section className="rounded-3xl border border-white/[0.06] bg-white/[0.01] p-8 md:p-10 shadow-2xl space-y-10 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-80 h-80 bg-white/[0.02] rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2 pointer-events-none" />


                    <div className="relative z-10 group rounded-2xl bg-white/[0.005] hover:bg-white/[0.015] transition-all duration-300 p-8 flex flex-col items-center justify-center text-center space-y-6">
                        <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center border border-white/5 shrink-0 group-hover:bg-white/10 transition-colors">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/30 group-hover:text-white transition-colors"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
                        </div>
                        
                        <div className="space-y-1.5">
                            <div className="text-white/80 font-semibold text-base tracking-tight">
                                {selectedFile ? (
                                    <span className="text-white">{selectedFile.name}</span>
                                ) : (
                                    "Select your statement file"
                                )}
                            </div>
                            <p className="text-[10px] text-white/20 font-medium uppercase tracking-widest">
                                Drag and drop or browse files
                            </p>
                        </div>

                        <label className="inline-flex cursor-pointer rounded-xl bg-white px-5 py-2 text-black font-bold text-[10px] uppercase tracking-widest transition-all hover:bg-gray-200 hover:scale-105 active:scale-95 shadow-xl shadow-white/5 mt-2">
                            Select Source
                            <input
                                ref={inputRef}
                                type="file"
                                accept="application/pdf,.pdf,text/csv,.csv"
                                onChange={handleFileChange}
                                className="hidden"
                            />
                        </label>
                    </div>

                    <div className="flex flex-col gap-8 pt-4 relative z-10 border-t border-white/5">
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-4">
                                <button
                                    type="button"
                                    onClick={handleUpload}
                                    disabled={!selectedFile || isUploading}
                                    className="rounded-xl border border-white/5 bg-white/[0.05] px-5 py-2 text-[10px] font-bold uppercase tracking-widest transition-all hover:bg-white/10 hover:border-white/20 disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                    {isUploading ? "Uploading..." : "Upload"}
                                </button>
                                
                                {success && !error && !isUploading && (
                                    <div className="flex items-center gap-2 animate-in fade-in zoom-in slide-in-from-left-2 duration-500">
                                        <div className="w-6 h-6 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                        </div>
                                        <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Statement Processed</span>
                                    </div>
                                )}

                                {duplicateMessage && !isUploading && (
                                    <div className="flex items-center gap-2 animate-in fade-in zoom-in slide-in-from-left-2 duration-500">
                                        <div className="w-6 h-6 rounded-full bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                                        </div>
                                        <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest">Statement Exists</span>
                                    </div>
                                )}
                            </div>
                        </div>
                        
                        <div className="flex justify-start pt-4 border-t border-white/[0.03]">
                            <p className="text-[9px] text-white/10 font-bold uppercase tracking-[0.4em]">Encrypted & Secure</p>
                        </div>
                    </div>

                    {error && (
                        <div className="relative z-10 rounded-2xl border border-red-500/20 bg-red-500/10 px-6 py-4 flex flex-col gap-1 mt-6">
                            <span className="text-red-400 font-medium text-sm">Upload failed</span>
                            <span className="text-red-300/70 text-sm">{error}</span>
                        </div>
                    )}
                </section>
            </div>
        </main>
    );
}