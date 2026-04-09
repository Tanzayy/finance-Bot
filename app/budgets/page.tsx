"use client";

import { useState, useEffect } from "react";
import PageHeader from "@/components/PageHeader";
import { auth, db } from "@/lib/firebase";
import { collection, query, where, getDocs, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

const CATEGORIES = [
    { id: "housing", label: "Housing & Rent", icon: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" },
    { id: "utilities", label: "Bills & Utilities", icon: "M13 2L3 14h9l-1 8 10-12h-9l1-8z" },
    { id: "food", label: "Food & Dining", icon: "M17 8h1a4 4 0 1 1 0 8h-1M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" },
    { id: "travel", label: "Travel & Transport", icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6" },
    { id: "shopping", label: "Retail & Shopping", icon: "M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z M3 6h18 M16 10a4 4 0 0 1-8 0" },
    { id: "entertainment", label: "Entertainment", icon: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M8 9h.01 M16 9h.01 M8 15a6 6 0 0 0 8 0" },
    { id: "health", label: "Health & Fitness", icon: "M22 12h-4l-3 9L9 3l-3 9H2" },
    { id: "other", label: "Miscellaneous", icon: "M12 2v20 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" }
];

export default function BudgetsPage() {
    const [budgets, setBudgets] = useState<Record<string, string>>({
        housing: "",
        utilities: "",
        food: "",
        travel: "",
        shopping: "",
        entertainment: "",
        health: "",
        other: ""
    });
    const [isSaving, setIsSaving] = useState(false);
    const [successMsg, setSuccessMsg] = useState("");
    const [userId, setUserId] = useState<string | null>(null);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                setUserId(user.uid);
                try {
                    const q = query(collection(db, "budgets"), where("userId", "==", user.uid));
                    const snapshot = await getDocs(q);
                    const loaded: Record<string, string> = {};
                    snapshot.forEach(document => {
                        const data = document.data();
                        loaded[data.category] = data.amount.toString();
                    });
                    setBudgets(prev => ({ ...prev, ...loaded }));
                } catch (error) {
                    console.error("Failed to load budgets:", error);
                }
            } else {
                setUserId(null);
            }
        });
        return () => unsubscribe();
    }, []);

    const handleChange = (id: string, value: string) => {
        setBudgets(prev => ({ ...prev, [id]: value }));
        setSuccessMsg("");
    };

    const handleSave = async () => {
        if (!userId) return;
        setIsSaving(true);
        setSuccessMsg("");
        
        try {
            for (const cat of CATEGORIES) {
                const val = parseFloat(budgets[cat.id]);
                if (!isNaN(val) && val >= 0) {
                    const docRef = doc(db, "budgets", `${userId}_${cat.id}`);
                    await setDoc(docRef, {
                        userId,
                        category: cat.id,
                        amount: val,
                        updatedAt: serverTimestamp()
                    });
                }
            }
            setSuccessMsg("Budgets saved successfully");
        } catch (error) {
            console.error("Failed to save budgets:", error);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <main className="page-main">
            <div className="page-content">
                <PageHeader
                    title="Set Your Limits"
                    backHref="/dashboard"
                />

                <section className="rounded-3xl border border-white/[0.06] bg-[#242424] p-8 md:p-10 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-80 h-80 bg-white/[0.02] rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                    
                    <div className="space-y-10 relative z-10">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
                            {CATEGORIES.map((cat) => (
                                <div key={cat.id} className="group space-y-3">
                                    <label className="flex items-center gap-2.5 text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] transition-colors group-focus-within:text-white/70 border-l border-white/5 pl-3">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-40 group-focus-within:opacity-80 transition-opacity">
                                            <path d={cat.icon}/>
                                        </svg>
                                        {cat.label}
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 font-medium text-sm">₹</span>
                                        <input
                                            type="number"
                                            placeholder="0"
                                            value={budgets[cat.id] || ""}
                                            onChange={(e) => handleChange(cat.id, e.target.value)}
                                            className="w-full pl-8 pr-4 py-3.5 rounded-xl bg-white/[0.02] border border-white/5 outline-none focus:border-white/20 focus:bg-white/[0.04] transition-all text-sm text-white placeholder-white/10 shadow-inner no-spinner"
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="pt-8 border-t border-white/5 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={handleSave}
                                    disabled={isSaving || !userId}
                                    className="px-5 py-2 bg-[#d4d4d4] text-black rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all hover:bg-gray-200 hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.1)] disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                    {isSaving ? "Saving..." : "Save Limits"}
                                </button>
                                {successMsg && (
                                    <span className="text-emerald-400 text-[10px] font-bold uppercase tracking-widest animate-fade-in pl-2">
                                        {successMsg}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </main>
    );
}