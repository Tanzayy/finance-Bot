"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { auth, db } from "@/lib/firebase";
import { collection, query, where, getDocs, orderBy, Timestamp, deleteDoc, doc, writeBatch } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { groupStatementsByPeriod, MONTH_NAMES, Statement } from "@/lib/finance-utils";

export default function StatementsPage() {
    const [statements, setStatements] = useState<Statement[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDeleting, setIsDeleting] = useState<string | null>(null);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                try {
                    const q = query(
                        collection(db, "statements"),
                        where("userId", "==", user.uid),
                        orderBy("uploadedAt", "desc")
                    );
                    const txQuery = query(collection(db, "transactions"), where("userId", "==", user.uid));
                    const txSnap = await getDocs(txQuery);
                    const spendMap: Record<string, number> = {};
                    txSnap.forEach(doc => {
                        const data = doc.data();
                        if (data.type === "debit") {
                            spendMap[data.statementId] = (spendMap[data.statementId] || 0) + (data.amount || 0);
                        }
                    });

                    const querySnapshot = await getDocs(q);
                    const fetchedStatements: Statement[] = [];
                    querySnapshot.forEach((doc) => {
                        const data = doc.data();
                        fetchedStatements.push({ 
                            id: doc.id, 
                            ...data,
                            totalSpend: data.totalSpend !== undefined ? data.totalSpend : (spendMap[doc.id] || 0)
                        } as Statement);
                    });
                    setStatements(fetchedStatements);
                } catch (error) {
                    console.error("Error fetching statements:", error);
                } finally {
                    setIsLoading(false);
                }
            } else {
                setStatements([]);
                setIsLoading(false);
            }
        });

        return () => unsubscribe();
    }, []);

    const formatDate = (timestamp: Timestamp) => {
        if (!timestamp) return "---";
        return new Date(timestamp.seconds * 1000).toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
        });
    };

    const handleDelete = async (statementId: string) => {
        if (!confirm("Are you sure you want to delete this statement and all its transactions? This cannot be undone.")) return;
        
        setIsDeleting(statementId);
        try {
            console.log(`[Statements] Initiating robust deletion for statement: ${statementId}`);
            
            // 1. Fetch all linked transactions
            const txQuery = query(
                collection(db, "transactions"), 
                where("statementId", "==", statementId),
                where("userId", "==", auth.currentUser?.uid)
            );
            const txSnapshot = await getDocs(txQuery);
            const txDocs = txSnapshot.docs;
            
            console.log(`[Statements] Found ${txDocs.length} linked transactions. Deleting in chunks...`);
            
            // 2. Delete transactions in chunks (Firestore limit is 500 per batch)
            const chunkSize = 450;
            for (let i = 0; i < txDocs.length; i += chunkSize) {
                const chunk = txDocs.slice(i, i + chunkSize);
                const batch = writeBatch(db);
                chunk.forEach((transaction) => {
                    batch.delete(doc(db, "transactions", transaction.id));
                });
                await batch.commit();
                console.log(`[Statements] Deleted chunk ${Math.floor(i/chunkSize) + 1} of ${Math.ceil(txDocs.length/chunkSize)}`);
            }
            
            // 3. Delete statement record
            await deleteDoc(doc(db, "statements", statementId));
            console.log("[Statements] Statement record deleted. Deletion complete.");
            
            // 4. Update local state
            setStatements(prev => prev.filter(s => s.id !== statementId));
        } catch (error) {
            console.error("Error deleting statement:", error);
            alert("Failed to delete statement. Please try again.");
        } finally {
            setIsDeleting(null);
        }
    };

    return (
        <main className="page-main">
            <div className="page-content">
                <PageHeader
                    title="History"
                    backHref="/dashboard"
                />

                <div className="rounded-3xl border border-white/5 bg-gradient-to-br from-white/[0.03] to-transparent shadow-2xl relative overflow-hidden backdrop-blur-sm">
                    {/* Header Row */}
                    <div className="grid grid-cols-12 px-8 py-5 border-b border-white/5 text-xs font-semibold text-white/40 tracking-[0.2em] uppercase bg-black/50">
                        <div className="col-span-6 md:col-span-5">File Name</div>
                        <div className="col-span-3 hidden md:block">Type</div>
                        <div className="col-span-3">Status</div>
                        <div className="col-span-3 md:col-span-1 text-right">Actions</div>
                    </div>

                    {/* Table Body */}
                    <div className="flex flex-col min-h-[400px]">
                        {isLoading ? (
                            <div className="flex-1 flex items-center justify-center">
                                <div className="text-white/20 animate-pulse font-medium">Loading history...</div>
                            </div>
                        ) : statements.length > 0 ? (
                            (() => {
                                const grouped = groupStatementsByPeriod(statements);
                                const sortedYears = Object.keys(grouped).map(Number).sort((a, b) => b - a);

                                return sortedYears.map(year => (
                                    <div key={year} className="space-y-1">
                                        {/* Year Header */}
                                        <div className="px-8 py-3 bg-white/[0.02] border-y border-white/5 flex items-center gap-3">
                                            <span className="text-sm font-bold text-white/40 tracking-widest">{year}</span>
                                            <div className="flex-1 h-px bg-white/[0.03]" />
                                        </div>

                                        {Object.keys(grouped[year]).map(Number).sort((a,b) => b-a).map(month => (
                                            <div key={`${year}-${month}`} className="space-y-0.5">
                                                {/* Month Header */}
                                                <div className="px-10 py-2.5 text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] border-l border-white/5 ml-8 mt-2 mb-1">
                                                    {MONTH_NAMES[month]}
                                                </div>

                                                {grouped[year][month].map((stmt) => (
                                                    <div key={stmt.id} className="grid grid-cols-12 px-10 py-4 hover:bg-white/[0.02] transition-colors items-center group/item border-b border-white/[0.02]">
                                                        <div className="col-span-6 md:col-span-5 flex flex-col gap-0.5">
                                                            <span className="text-[13px] font-medium text-white/80 group-hover/item:text-white transition-colors">{stmt.fileName}</span>
                                                            <span className="text-[10px] text-white/20 uppercase tracking-wide">
                                                                {formatDate(stmt.uploadedAt)} • {stmt.transactionCount || 0} items
                                                                {stmt.totalSpend !== undefined && (
                                                                    <> • Spend: ₹{new Intl.NumberFormat('en-IN').format(stmt.totalSpend)}</>
                                                                )}
                                                            </span>
                                                        </div>
                                                        <div className="col-span-3 hidden md:block">
                                                            <span className="text-[10px] text-white/30 font-mono tracking-tight bg-white/5 px-2 py-0.5 rounded border border-white/[0.02]">
                                                                {stmt.sourceType?.toUpperCase() || "UNK"}
                                                            </span>
                                                        </div>
                                                        <div className="col-span-3 flex items-center gap-2">
                                                            <div className={`w-1 h-1 rounded-full ${stmt.status === 'processed' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                                                            <span className="text-[11px] font-medium text-white/40 capitalize">{stmt.status}</span>
                                                        </div>
                                                        <div className="col-span-3 md:col-span-1 text-right">
                                                            <button 
                                                                onClick={() => handleDelete(stmt.id)}
                                                                disabled={isDeleting === stmt.id}
                                                                className="text-white/10 hover:text-red-400 transition-all disabled:opacity-30 p-2"
                                                            >
                                                                {isDeleting === stmt.id ? (
                                                                    <div className="w-3.5 h-3.5 border-2 border-white/10 border-t-white/60 rounded-full animate-spin mx-auto" />
                                                                ) : (
                                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                                                                )}
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ))}
                                    </div>
                                ));
                            })()
                        ) : (
                            /* Empty State */
                            <div className="px-8 py-16 text-center flex-1 flex flex-col items-center justify-center">
                                <div className="w-12 h-12 rounded-full bg-white/5 border border-white/5 flex items-center justify-center mb-4">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-white/30"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
                                </div>
                                <p className="text-white/50 text-xs font-medium">No history found</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </main>
    );
}