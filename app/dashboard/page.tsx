"use client";

import Link from "next/link";
import { useState, useEffect, useMemo } from "react";
import { auth, db } from "@/lib/firebase";
import { collection, query, where, getDocs, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc, updateDoc } from "firebase/firestore";

interface Goal {
    id: string;
    name: string;
    targetAmount: number;
    months: number;
    savedAmount: number;
}
import PageHeader from "@/components/PageHeader";
import { onAuthStateChanged } from "firebase/auth";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

import { getMonthYear, getSavingRecommendations, MONTH_NAMES, normalizeMerchantName, enrichCategory, detectRecurring, getBehavioralInsights } from "@/lib/finance-utils";

const CHART_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6'];

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-[#1a1a1a]/95 border border-white/10 rounded-xl p-3 shadow-2xl backdrop-blur-md">
                <p className="text-[10px] text-white/50 font-bold uppercase mb-1 tracking-widest">{label}</p>
                <p className="text-sm font-bold text-white">
                    {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(payload[0].value)}
                </p>
            </div>
        );
    }
    return null;
};

type FilterMode = "this_month" | "last_month" | "this_year" | "all_time" | "custom";

export default function DashboardPage() {
    const [totalSpend, setTotalSpend] = useState(0);
    const [totalBudget, setTotalBudget] = useState(0);
    const [activeAlertCount, setActiveAlertCount] = useState(0);
    const [latestAlert, setLatestAlert] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    
    const [categoryData, setCategoryData] = useState<{name: string, value: number}[]>([]);
    const [merchantData, setMerchantData] = useState<{name: string, value: number}[]>([]);
    const [timeSeriesData, setTimeSeriesData] = useState<{name: string, value: number, sortKey: number}[]>([]);
    const [spendingInsights, setSpendingInsights] = useState<string[]>([]);
    const [behavioralInsights, setBehavioralInsights] = useState<string[]>([]);
    const [exportableDebits, setExportableDebits] = useState<any[]>([]);
    const [savingsRecommendations, setSavingsRecommendations] = useState<{title: string; hint: string; amount: number}[]>([]);
    const [recurringSpends, setRecurringSpends] = useState<{merchant: string; amount: number; frequency: string; category: string}[]>([]);
    
    // Goals
    const [goals, setGoals] = useState<Goal[]>([]);
    const [newGoalName, setNewGoalName] = useState("");
    const [newGoalTarget, setNewGoalTarget] = useState("");
    const [newGoalMonths, setNewGoalMonths] = useState("");
    
    // Filters
    const [filterMode, setFilterMode] = useState<FilterMode>("this_month");
    const [selectedYear, setSelectedYear] = useState<number | "all">("all");
    const [selectedMonth, setSelectedMonth] = useState<number | "all">("all");
    const [momChange, setMomChange] = useState<number | null>(null);

    const now = useMemo(() => new Date(), []);
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    const targetYear = useMemo(() => {
        if (filterMode === "this_month") return currentYear;
        if (filterMode === "last_month") return currentMonth === 0 ? currentYear - 1 : currentYear;
        if (filterMode === "this_year") return currentYear;
        if (filterMode === "custom") return selectedYear;
        return "all";
    }, [filterMode, selectedYear, currentYear, currentMonth]);

    const targetMonth = useMemo(() => {
        if (filterMode === "this_month") return currentMonth;
        if (filterMode === "last_month") return currentMonth === 0 ? 11 : currentMonth - 1;
        if (filterMode === "this_year" || filterMode === "all_time") return "all";
        if (filterMode === "custom") return selectedMonth;
        return "all";
    }, [filterMode, selectedMonth, currentMonth]);

    useEffect(() => {
        const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
            if (user) {
                setIsLoading(true);

                // 1. Transactions Listener (Real-time)
                const q = query(
                    collection(db, "transactions"), 
                    where("userId", "==", user.uid),
                    where("type", "==", "debit")
                );

                const unsubscribeTransactions = onSnapshot(q, (snapshot) => {
                    let currSpend = 0;
                    let prevPeriodSpend = 0;
                    const catMap: Record<string, number> = {};
                    const prevCatMap: Record<string, number> = {};
                    const merchMap: Record<string, number> = {};
                    const timeMap: Record<number, {name: string, value: number, sortKey: number}> = {};
                    const allDebits: any[] = [];
                    const activeFilteredDebits: any[] = [];

                    snapshot.forEach((doc) => {
                        const data = doc.data();
                        allDebits.push(data);
                        const { day, month, year } = getMonthYear(data.date);
                        
                        const isMatch = (targetYear === "all" || year === targetYear) && 
                                        (targetMonth === "all" || month === targetMonth);
                        
                        const isPrevPeriod = (() => {
                            if (targetYear === "all") return false;
                            if (targetMonth === "all") return year === (targetYear as number) - 1;
                            
                            if (month === (targetMonth as number) - 1 && year === targetYear) return true;
                            if (targetMonth === 0 && month === 11 && year === (targetYear as number) - 1) return true;
                            
                            return false;
                        })();

                        const amt = data.amount || 0;

                        if (isMatch) {
                            activeFilteredDebits.push(data);
                            const cleanMerchant = normalizeMerchantName(data.originalDescription || data.description);
                            const cleanCat = enrichCategory(cleanMerchant, data.category);

                            currSpend += amt;
                            catMap[cleanCat] = (catMap[cleanCat] || 0) + amt;
                            merchMap[cleanMerchant] = (merchMap[cleanMerchant] || 0) + amt;
                            
                            // Time series parsing
                            if (targetMonth !== "all") {
                                // Group by Day
                                const sortKey = day || 1;
                                if (!timeMap[sortKey]) {
                                    timeMap[sortKey] = { name: `${sortKey} ${MONTH_NAMES[month].substring(0,3)}`, value: 0, sortKey };
                                }
                                timeMap[sortKey].value += amt;
                            } else {
                                // Group by Month
                                const sortKey = year * 100 + month;
                                if (!timeMap[sortKey]) {
                                    timeMap[sortKey] = { name: `${MONTH_NAMES[month].substring(0,3)} '${year.toString().substring(2)}`, value: 0, sortKey };
                                }
                                timeMap[sortKey].value += amt;
                            }
                        }

                        if (isPrevPeriod) {
                            const cleanMerchant = normalizeMerchantName(data.originalDescription || data.description);
                            const cleanCat = enrichCategory(cleanMerchant, data.category);
                            
                            prevPeriodSpend += amt;
                            prevCatMap[cleanCat] = (prevCatMap[cleanCat] || 0) + amt;
                        }
                    });

                    setTotalSpend(currSpend);

                    // MoM / YoY Calculation
                    if (targetYear !== "all" && prevPeriodSpend > 0) {
                        setMomChange(((currSpend - prevPeriodSpend) / prevPeriodSpend) * 100);
                    } else {
                        setMomChange(null);
                    }

                    // Sorting & Insights
                    const sortedCats = Object.entries(catMap)
                        .map(([name, value]) => ({ name, value }))
                        .sort((a, b) => b.value - a.value);
                    setCategoryData(sortedCats);

                    const sortedMerchs = Object.entries(merchMap)
                        .map(([name, value]) => ({ name, value }))
                        .sort((a, b) => b.value - a.value)
                        .slice(0, 5);
                    setMerchantData(sortedMerchs);

                    setRecurringSpends(detectRecurring(allDebits));

                    setSavingsRecommendations(getSavingRecommendations(catMap, prevCatMap, merchMap, currSpend, targetYear === "all"));

                    const sortedTimeSeries = Object.values(timeMap).sort((a, b) => a.sortKey - b.sortKey);
                    setTimeSeriesData(sortedTimeSeries);

                    const insights: string[] = [];
                    
                    if (targetYear !== "all" && prevPeriodSpend > 0) {
                        const diff = ((currSpend - prevPeriodSpend) / prevPeriodSpend) * 100;
                        const periodStr = targetMonth === "all" ? "last year" : "last month";
                        if (Math.abs(diff) > 2) {
                            insights.push(`Your total spend is ${diff > 0 ? 'up' : 'down'} ${Math.abs(Math.round(diff))}% compared to ${periodStr}.`);
                        }
                    }

                    let maxSurgeCat = "";
                    let maxSurgePct = 0;
                    
                    if (targetYear !== "all" && prevPeriodSpend > 0) {
                        Object.entries(catMap).forEach(([cat, amt]) => {
                            const prevAmt = prevCatMap[cat] || 0;
                            if (prevAmt > 0 && (amt / currSpend) > 0.05) {
                                const surge = ((amt - prevAmt) / prevAmt) * 100;
                                if (surge > maxSurgePct && surge > 5) {
                                    maxSurgePct = surge;
                                    maxSurgeCat = cat;
                                }
                            }
                        });
                        
                        if (maxSurgeCat) {
                            const periodStr = targetMonth === "all" ? "last year" : "last month";
                            insights.push(`${maxSurgeCat} spending surged ${Math.round(maxSurgePct)}% vs ${periodStr}.`);
                        }
                    }

                    if (sortedCats.length > 0 && !maxSurgeCat) {
                       insights.push(`${sortedCats[0].name} is your highest spending category this period.`);
                    }
                    if (sortedMerchs.length > 0) {
                       const merchShare = Math.round((sortedMerchs[0].value/currSpend)*100);
                       if (merchShare > 15) {
                           insights.push(`A single merchant (${sortedMerchs[0].name}) accounts for ${merchShare}% of your spend.`);
                       } else {
                           insights.push(`You spent most frequently at ${sortedMerchs[0].name}.`);
                       }
                    }
                    setSpendingInsights(insights);
                    setBehavioralInsights(getBehavioralInsights(activeFilteredDebits, currSpend, catMap));
                    setExportableDebits(activeFilteredDebits);
                    setIsLoading(false);
                });

                // 2. Budget Listener (Real-time)
                const budgetQ = query(
                    collection(db, "budgets"),
                    where("userId", "==", user.uid)
                );
                const unsubscribeBudget = onSnapshot(budgetQ, (snapshot) => {
                    let currBudget = 0;
                    snapshot.forEach((doc) => {
                        currBudget += (doc.data().amount || 0);
                    });
                    setTotalBudget(currBudget);
                });

                // 3. Alerts Listener (Real-time)
                const alertsQ = query(
                    collection(db, "alerts"),
                    where("userId", "==", user.uid),
                    where("status", "==", "active")
                );
                const unsubscribeAlerts = onSnapshot(alertsQ, (snapshot) => {
                    let aCount = 0;
                    let newestAlert: any = null;
                    snapshot.forEach((document) => {
                        const data = document.data();
                        
                        let matchesTime = true;
                        if (data.createdAt) {
                            const d = data.createdAt.toDate();
                            const y = d.getFullYear();
                            const m = d.getMonth();
                            if ((targetYear !== "all" && y !== targetYear) || (targetMonth !== "all" && m !== targetMonth)) {
                                matchesTime = false;
                            }
                        }

                        if (matchesTime) {
                            aCount++;
                            if (!newestAlert || (data.createdAt && newestAlert.createdAt && data.createdAt.toMillis() > newestAlert.createdAt.toMillis())) {
                                 newestAlert = data;
                            }
                        }
                    });
                    setActiveAlertCount(aCount);
                    setLatestAlert(newestAlert);
                });

                // 4. Goals Listener (Real-time)
                const goalsQ = query(
                    collection(db, "goals"),
                    where("userId", "==", user.uid)
                );
                const unsubscribeGoals = onSnapshot(goalsQ, (snapshot) => {
                    const fetchedGoals: Goal[] = [];
                    snapshot.forEach((document) => {
                        fetchedGoals.push({ id: document.id, ...document.data() } as Goal);
                    });
                    setGoals(fetchedGoals);
                });

                return () => {
                    unsubscribeTransactions();
                    unsubscribeBudget();
                    unsubscribeAlerts();
                    unsubscribeGoals();
                };
            }
        });
        return () => unsubscribeAuth();
    }, [targetMonth, targetYear]);

    const formattedSpend = new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR'
    }).format(totalSpend);

    const isYearly = filterMode === "this_year" || (filterMode === "custom" && selectedYear !== "all" && selectedMonth === "all");
    const isAllTime = filterMode === "all_time" || (filterMode === "custom" && selectedYear === "all");
    
    let displayBudget = totalBudget;
    if (isYearly) displayBudget *= 12;
    if (isAllTime) displayBudget = 0;

    const formattedBudget = isAllTime ? "N/A" : new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR'
    }).format(displayBudget);

    const handleCreateGoal = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!auth.currentUser || !newGoalName || !newGoalTarget || !newGoalMonths) return;
        
        try {
            await addDoc(collection(db, "goals"), {
                userId: auth.currentUser.uid,
                name: newGoalName,
                targetAmount: parseFloat(newGoalTarget),
                months: parseInt(newGoalMonths),
                savedAmount: 0,
                createdAt: serverTimestamp()
            });
            setNewGoalName("");
            setNewGoalTarget("");
            setNewGoalMonths("");
        } catch (error) {
            console.error("Error creating goal", error);
        }
    };

    const handleDeleteGoal = async (id: string) => {
        if (!confirm("Delete this goal permanently?")) return;
        try {
            await deleteDoc(doc(db, "goals", id));
        } catch (error) {
            console.error("Error deleting goal", error);
        }
    };

    const handleExportCSV = () => {
        if (exportableDebits.length === 0) return;
        
        const headers = ["Date", "Normalized Merchant", "Category", "Amount", "Source", "Original Description"];
        const rows = exportableDebits.map(tx => {
            const cleanMerchant = normalizeMerchantName(tx.originalDescription || tx.description);
            const cleanCat = enrichCategory(cleanMerchant, tx.category);
            const source = tx.source || "Unknown";
            const amt = tx.amount || 0;
            // Secure arbitrary strings to prevent native CSV fracture
            const rawDesc = `"${String(tx.originalDescription || tx.description || "").replace(/"/g, '""')}"`;
            
            return [tx.date, `"${cleanMerchant}"`, cleanCat, amt, source, rawDesc].join(",");
        });
        
        const csvContent = [headers.join(","), ...rows].join("\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `finance-transactions-${filterMode}.csv`);
        document.body.appendChild(link);
        link.click();
        link.remove();
    };

    const handleExportSummary = () => {
        const lines: string[] = [];
        lines.push(`=== FINANCE SUMMARY EXPORT ===`);
        lines.push(`Period: ${filterMode.replace("_", " ").toUpperCase()}`);
        lines.push(`Total Spend: ${formattedSpend}`);
        lines.push(`Budget: ${formattedBudget}`);
        lines.push(``);
        lines.push(`--- BEHAVIORAL INSIGHTS ---`);
        if (behavioralInsights.length > 0) {
            behavioralInsights.forEach(i => lines.push(`- ${i}`));
        } else {
            lines.push(`No behavioral anomalies detected.`);
        }
        lines.push(``);
        lines.push(`--- SAVINGS STRATEGY ---`);
        if (savingsRecommendations.length > 0) {
            savingsRecommendations.forEach(r => lines.push(`- ${r.title}: ${r.hint}`));
        } else {
            lines.push(`No structural savings identified.`);
        }
        lines.push(``);
        lines.push(`--- GENERAL INSIGHTS ---`);
        if (spendingInsights.length > 0) {
            spendingInsights.forEach(i => lines.push(`- ${i}`));
        } else {
            lines.push(`Not enough data generated.`);
        }
        
        const txtContent = lines.join("\n");
        const blob = new Blob([txtContent], { type: "text/plain;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `finance-summary-${filterMode}.txt`);
        document.body.appendChild(link);
        link.click();
        link.remove();
    };

    return (
        <main className="page-main">
            <div className="page-content">
                <PageHeader 
                    title="Financial Intelligence" 
                    subtitle="Clarity. Control. Confidence."
                    showBack={false}
                />

                <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 py-1.5 border-b border-white/5 pb-4 mb-8">
                    <div className="flex items-center gap-8 text-[11px] font-medium tracking-widest uppercase text-white/30">
                        <div className="flex flex-col gap-0.5">
                            <span className="text-[10px]">Total Spending</span>
                            <span className="text-white/80 text-sm tracking-normal">{isLoading ? "---" : formattedSpend}</span>
                        </div>
                        <div className="flex flex-col gap-0.5 border-l border-white/10 pl-8">
                            <span className="text-[10px]">Budget</span>
                            <span className="text-white/80 text-sm tracking-normal">{isLoading ? "---" : formattedBudget}</span>
                        </div>
                        <div className="flex flex-col gap-0.5 border-l border-white/10 pl-8">
                            <span className="text-[10px]">Alerts</span>
                            <span className={`${activeAlertCount > 0 ? 'text-red-400' : 'text-emerald-400'} text-sm tracking-normal`}>{activeAlertCount}</span>
                        </div>
                    </div>
                </header>

                <div className="space-y-6">
                    {/* Filters Row */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
                        <div className="flex flex-wrap items-center gap-2">
                            {[
                                { id: "this_month", label: "This Month" },
                                { id: "last_month", label: "Last Month" },
                                { id: "this_year", label: "This Year" },
                                { id: "all_time", label: "All Time" },
                                { id: "custom", label: "Custom" }
                            ].map(filter => (
                                <button 
                                    key={filter.id}
                                    onClick={() => setFilterMode(filter.id as FilterMode)}
                                    className={`px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${
                                        filterMode === filter.id 
                                        ? 'bg-[#d4d4d4] text-black shadow-[0_0_10px_rgba(255,255,255,0.1)]'
                                        : 'bg-white/[0.03] text-white/40 border border-white/[0.05] hover:bg-white/[0.08] hover:text-white/80'
                                    }`}
                                >
                                    {filter.label}
                                </button>
                            ))}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                            <button 
                                onClick={handleExportSummary} 
                                className="px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest bg-white/[0.03] border border-white/[0.05] text-white/40 hover:bg-white/[0.08] hover:text-white transition-all shadow-sm flex items-center gap-2"
                            >
                                Summary .TXT
                            </button>
                            <button 
                                onClick={handleExportCSV} 
                                className="px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest bg-white/[0.03] border border-white/[0.05] text-white/40 hover:bg-white/[0.08] hover:text-white transition-all shadow-sm flex items-center gap-2"
                            >
                                Export .CSV
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-70"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                            </button>
                        </div>
                    </div>

                    {filterMode === "custom" && (
                        <div className="flex items-center gap-4 text-[11px] font-bold uppercase tracking-widest mb-4 bg-white/[0.02] p-3 rounded-xl border border-white/5 w-fit">
                            <select 
                                value={selectedMonth} 
                                onChange={(e) => setSelectedMonth(e.target.value === "all" ? "all" : parseInt(e.target.value))}
                                className="bg-transparent border-none outline-none text-white/60 hover:text-white transition-colors cursor-pointer appearance-none"
                            >
                                <option value="all" className="bg-[#242424] text-emerald-400">All Months</option>
                                {MONTH_NAMES.map((name, idx) => (
                                    <option key={idx} value={idx} className="bg-[#242424]">{name}</option>
                                ))}
                            </select>
                            <span className="text-white/10">/</span>
                            <select 
                                value={selectedYear} 
                                onChange={(e) => setSelectedYear(e.target.value === "all" ? "all" : parseInt(e.target.value))}
                                className="bg-transparent border-none outline-none text-white/60 hover:text-white transition-colors cursor-pointer appearance-none"
                            >
                                <option value="all" className="bg-[#242424] text-emerald-400">All Time</option>
                                <option value={2026} className="bg-[#242424]">2026</option>
                                <option value={2025} className="bg-[#242424]">2025</option>
                            </select>
                        </div>
                    )}

                    <div className="grid gap-x-6 gap-y-6 lg:grid-cols-12">
                        {/* Left Column: Data & Filters */}
                        <div className="lg:col-span-8 space-y-6">
                            
                            <div className="grid gap-6 md:grid-cols-2">
                                {/* Breakdown by Category (Visual + List) */}
                                <section className="space-y-5 bg-[#242424] border border-white/[0.04] p-5 rounded-2xl flex flex-col shadow-xl">
                                    <h3 className="text-[10px] font-bold tracking-[0.2em] uppercase text-white/40 border-l border-white/10 pl-3">
                                        Category Distribution
                                    </h3>
                                    {categoryData.length > 0 ? (
                                        <div className="flex-1 flex flex-col">
                                            <div className="h-44 w-full">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <PieChart>
                                                        <Pie
                                                            data={categoryData}
                                                            cx="50%"
                                                            cy="50%"
                                                            innerRadius={45}
                                                            outerRadius={70}
                                                            paddingAngle={3}
                                                            dataKey="value"
                                                            stroke="rgba(0,0,0,0.5)"
                                                            strokeWidth={2}
                                                        >
                                                            {categoryData.map((entry, index) => (
                                                                <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                                                            ))}
                                                        </Pie>
                                                        <Tooltip content={<CustomTooltip />} cursor={{fill: 'rgba(255,255,255,0.05)'}} />
                                                    </PieChart>
                                                </ResponsiveContainer>
                                            </div>
                                            <div className="grid grid-cols-2 gap-x-2 gap-y-3 mt-4 pt-4 border-t border-white/[0.03]">
                                                {categoryData.slice(0, 4).map((cat, idx) => (
                                                    <div key={idx} className="flex flex-col gap-1">
                                                        <div className="flex items-center gap-1.5">
                                                            <div className="w-1.5 h-1.5 rounded-full shadow-[0_0_8px_rgba(255,255,255,0.2)]" style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }} />
                                                            <span className="text-[10px] font-semibold text-white/70 truncate">{cat.name}</span>
                                                        </div>
                                                        <span className="text-[10px] text-white/40 pl-3">
                                                             {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(cat.value)}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        <p className="text-[10px] text-white/10 italic py-4">No category data for this period.</p>
                                    )}
                                </section>

                                {/* Top Merchants Leaderboard */}
                                <section className="space-y-5 bg-[#242424] border border-white/[0.04] p-5 rounded-2xl shadow-xl">
                                    <h3 className="text-[10px] font-bold tracking-[0.2em] uppercase text-white/40 border-l border-white/10 pl-3">
                                        Where You Shop Most
                                    </h3>
                                    <div className="space-y-1 pt-1">
                                        {merchantData.length > 0 ? merchantData.map((merch, idx) => (
                                            <div key={idx} className="flex items-center justify-between group py-2.5 border-b border-white/[0.02] last:border-0 hover:bg-[#242424] -mx-2 px-2 rounded-lg transition-colors">
                                                <div className="flex items-center gap-3 w-2/3">
                                                    <div className="w-5 h-5 rounded-md bg-white/[0.03] border border-white/[0.05] flex items-center justify-center shrink-0">
                                                        <span className="text-[8px] font-bold text-white/40">{idx + 1}</span>
                                                    </div>
                                                    <span className="text-[11px] font-medium text-white/50 truncate group-hover:text-white/80 transition-colors">{merch.name}</span>
                                                </div>
                                                <span className="text-[11px] font-semibold text-white/70">
                                                    {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(merch.value)}
                                                </span>
                                            </div>
                                        )) : (
                                            <p className="text-[10px] text-white/10 italic">No merchant data available.</p>
                                        )}
                                    </div>
                                </section>
                            </div>

                            {/* Time Series Chart */}
                            {timeSeriesData.length > 0 && (
                                <section className="bg-[#242424] border border-white/[0.04] p-5 md:p-6 rounded-2xl shadow-xl">
                                    <div className="flex justify-between items-center mb-6">
                                        <h3 className="text-[10px] font-bold tracking-[0.2em] uppercase text-white/40 border-l border-emerald-500/30 pl-3">
                                            Spending Overview
                                        </h3>
                                    </div>
                                    <div className="h-56 w-full">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={timeSeriesData} margin={{ top: 0, right: 0, left: -25, bottom: 0 }}>
                                                <XAxis dataKey="name" stroke="rgba(255,255,255,0.2)" fontSize={10} tickMargin={12} tickLine={false} axisLine={false} />
                                                <YAxis stroke="rgba(255,255,255,0.2)" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => `₹${val/1000}k`} />
                                                <Tooltip content={<CustomTooltip />} cursor={{fill: 'rgba(255,255,255,0.02)'}} />
                                                <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={40} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </section>
                            )}

                            {/* Savings Recommendations */}
                            {savingsRecommendations.length > 0 && (
                                <section className="space-y-5 pt-2">
                                    <h3 className="text-[10px] font-bold tracking-[0.3em] uppercase text-white/40 border-l border-emerald-500/20 pl-3">
                                        Savings Strategy
                                    </h3>
                                    <div className="space-y-3">
                                        {savingsRecommendations.map((rec, idx) => (
                                            <div key={idx} className="p-4 rounded-xl bg-emerald-500/[0.02] border border-emerald-500/10 group hover:bg-emerald-500/[0.05] transition-colors">
                                                <div className="flex justify-between items-start mb-1.5">
                                                    <h4 className="text-[10px] font-bold text-emerald-400/70 uppercase tracking-widest">{rec.title}</h4>
                                                    <span className="text-[10px] font-bold text-emerald-400/90">
                                                        {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(rec.amount)}
                                                    </span>
                                                </div>
                                                {rec.hint && (
                                                    <p className="text-[11px] text-white/40 leading-relaxed font-medium">
                                                        {rec.hint}
                                                    </p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            )}

                            {/* Recurring Commitments */}
                            {recurringSpends.length > 0 && (
                                <section className="space-y-5 pt-2">
                                    <h3 className="text-[10px] font-bold tracking-[0.3em] uppercase text-white/40 border-l border-emerald-500/20 pl-3">
                                        Recurring Commitments
                                    </h3>
                                    <div className="space-y-3">
                                        {recurringSpends.map((rec, idx) => (
                                            <div key={idx} className="p-4 rounded-xl bg-[#242424] border border-white/5 group hover:bg-white/[0.02] transition-colors">
                                                <div className="flex justify-between items-start mb-1.5">
                                                    <div className="flex flex-col gap-0.5">
                                                        <h4 className="text-[12px] font-bold text-white/90">{rec.merchant}</h4>
                                                        <span className="text-[9px] text-white/30 uppercase tracking-widest">{rec.category} • {rec.frequency}</span>
                                                    </div>
                                                    <span className="text-[11px] font-bold text-emerald-400/90">
                                                        {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(rec.amount)}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            )}

                        </div>

                        {/* Right Column: Insights & Alerts */}
                        <aside className="lg:col-span-4 space-y-6">
                            <section className="rounded-2xl border border-white/[0.06] bg-[#242424] flex flex-col p-5 space-y-5 shadow-xl">
                                <div className="flex justify-between items-center pb-2 border-b border-white/[0.03]">
                                    <h3 className="text-[10px] font-bold tracking-[0.3em] uppercase text-white/40">
                                        Insights
                                    </h3>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/10"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
                                </div>
                                
                                {momChange !== null && (
                                    <div className="p-4 rounded-xl border border-white/[0.04] bg-[#242424] relative overflow-hidden group">
                                        <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                        <p className="text-[9px] uppercase tracking-[0.2em] text-white/20 mb-1.5 relative z-10">Period Trend</p>
                                        <div className="flex items-baseline gap-2 relative z-10">
                                            <p className={`text-2xl font-semibold tracking-tight ${momChange > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                                {momChange > 0 ? '+' : ''}{momChange.toFixed(1)}%
                                            </p>
                                            <span className="text-[9px] text-white/20 uppercase tracking-widest">Growth</span>
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-4 pt-2">
                                    {spendingInsights.map((insight, idx) => (
                                        <div key={idx} className="flex gap-4 items-start group">
                                            <div className="w-1 h-1 rounded-full bg-white/20 mt-1.5 group-hover:bg-white/50 transition-colors shrink-0" />
                                            <p className="text-[11px] text-white/50 leading-relaxed font-medium">
                                                {insight}
                                            </p>
                                        </div>
                                    ))}
                                    {behavioralInsights.length > 0 && (
                                        <>
                                            <div className="pt-2 pb-1 border-t border-white/[0.03]">
                                                <h4 className="text-[9px] uppercase tracking-[0.2em] text-white/20">Behavioral Insights</h4>
                                            </div>
                                            {behavioralInsights.map((insight, idx) => (
                                                <div key={idx} className="flex gap-4 items-start group">
                                                    <div className="w-1 h-1 rounded-full bg-emerald-500/40 mt-1.5 group-hover:bg-emerald-500 transition-colors shrink-0 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                                                    <p className="text-[11px] text-emerald-400/80 leading-relaxed font-medium">
                                                        {insight}
                                                    </p>
                                                </div>
                                            ))}
                                        </>
                                    )}
                                    {spendingInsights.length === 0 && behavioralInsights.length === 0 && (
                                        <p className="text-[10px] text-white/20 italic">Not enough data to generate insights for this period.</p>
                                    )}
                                </div>
                            </section>

                            <section className="space-y-4 rounded-2xl border border-white/[0.06] bg-[#242424] p-5 shadow-xl">
                                <h3 className="text-[10px] font-bold tracking-[0.3em] uppercase text-white/40 border-l border-red-500/20 pl-3">
                                    Critical Alerts
                                </h3>
                                {latestAlert ? (
                                    <div className="p-4 rounded-xl bg-red-500/[0.02] border border-red-500/10 space-y-4 mt-2">
                                        <div className="flex items-start gap-4">
                                            <div className="w-8 h-8 rounded-full bg-red-500/5 border border-red-500/10 flex items-center justify-center shrink-0 mt-0.5">
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-400/80"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                                            </div>
                                            <div className="space-y-1">
                                                <p className="text-[11px] text-red-100/90 font-semibold leading-tight">
                                                    Action Required
                                                </p>
                                                <p className="text-[11px] text-red-400/60 leading-relaxed font-medium italic">
                                                    {latestAlert.message}
                                                </p>
                                            </div>
                                        </div>
                                        <Link href="/alerts" className="block text-center py-2.5 text-[10px] font-bold text-white/30 border border-white/10 rounded-lg uppercase tracking-widest hover:bg-white/10 hover:text-white transition-all shadow-[0_5px_15px_rgba(0,0,0,0.2)]">
                                            Review details
                                        </Link>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center p-6 text-center mt-2">
                                        <div className="w-10 h-10 rounded-full border border-white/[0.05] bg-[#242424] flex items-center justify-center mb-3">
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400/40">
                                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                                                <polyline points="22 4 12 14.01 9 11.01"></polyline>
                                            </svg>
                                        </div>
                                        <p className="text-[10px] text-white/30 uppercase tracking-[0.25em] font-bold">All Clear</p>
                                        <p className="text-[10px] text-white/10 mt-1 italic">Monitoring transactions</p>
                                    </div>
                                )}
                            </section>
                        </aside>
                    </div>

                    {/* Goals & Savings Plan */}
                    <section className="mt-8 rounded-2xl border border-white/[0.06] bg-gradient-to-b from-white/[0.01] to-transparent p-6 md:p-8 shadow-xl">
                        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 border-b border-white/[0.03] pb-6 mb-6">
                            <div>
                                <h3 className="text-[12px] font-bold tracking-[0.3em] uppercase text-white/40 border-l border-emerald-500/30 pl-3 mb-1">
                                    Goals & Savings Plan
                                </h3>
                                <p className="text-[10px] text-white/30 ml-4 font-medium italic">mathematically evaluating your trajectory against your targets</p>
                            </div>
                        </div>

                        {goals.length === 0 ? (
                            <form onSubmit={handleCreateGoal} className="max-w-2xl bg-[#242424]/40 border border-white/5 rounded-2xl p-6 relative overflow-hidden group">
                                <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10 w-full">
                                    <div className="space-y-1.5 flex flex-col justify-end">
                                        <label className="text-[10px] uppercase tracking-widest font-bold text-white/30">Goal Name</label>
                                        <input type="text" value={newGoalName} onChange={e=>setNewGoalName(e.target.value)} required className="w-full bg-white/[0.03] border-b border-white/10 px-3 py-2 text-white text-sm outline-none focus:border-emerald-500/50 transition-colors" placeholder="e.g. MacBook Pro" />
                                    </div>
                                    <div className="space-y-1.5 flex flex-col justify-end">
                                        <label className="text-[10px] uppercase tracking-widest font-bold text-white/30">Target (₹)</label>
                                        <input type="number" value={newGoalTarget} onChange={e=>setNewGoalTarget(e.target.value)} required min="1" className="w-full bg-white/[0.03] border-b border-white/10 px-3 py-2 text-white text-sm outline-none focus:border-emerald-500/50 transition-colors" placeholder="100000" />
                                    </div>
                                    <div className="space-y-1.5 flex flex-col justify-end">
                                        <label className="text-[10px] uppercase tracking-widest font-bold text-white/30">Timeframe</label>
                                        <div className="flex gap-4">
                                            <input type="number" value={newGoalMonths} onChange={e=>setNewGoalMonths(e.target.value)} required min="1" max="120" className="w-full bg-white/[0.03] border-b border-white/10 px-3 py-2 text-white text-sm outline-none focus:border-emerald-500/50 transition-colors placeholder:text-white/20" placeholder="Months" />
                                            <button type="submit" className="px-4 bg-white/5 hover:bg-white/10 text-white text-[10px] font-bold uppercase tracking-wider rounded border border-white/5 hover:border-emerald-500/40 transition-colors shrink-0">Initialize</button>
                                        </div>
                                    </div>
                                </div>
                            </form>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {goals.map(goal => {
                                    const reqSavings = goal.targetAmount / goal.months;
                                    const highestDiscObj = categoryData
                                        .filter(item => ['Food & Dining', 'Shopping', 'Entertainment'].includes(item.name))
                                        .sort((a,b) => b.value - a.value)[0];
                                    const possibleSavings = highestDiscObj ? highestDiscObj.value * 0.2 : 0;
                                    const gap = reqSavings - possibleSavings;
                                    
                                    return (
                                        <div key={goal.id} className="p-6 rounded-2xl bg-[#242424] border border-white/[0.05] relative overflow-hidden group">
                                            <div className="flex justify-between items-start mb-6">
                                                <div>
                                                    <h4 className="text-white font-semibold text-lg tracking-tight">{goal.name}</h4>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className="text-[11px] font-mono text-emerald-400">Target: {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(goal.targetAmount)}</span>
                                                        <span className="w-1 h-1 rounded-full bg-white/20" />
                                                        <span className="text-[11px] text-white/40 uppercase tracking-widest">{goal.months} Months</span>
                                                    </div>
                                                </div>
                                                <button onClick={() => handleDeleteGoal(goal.id)} className="text-white/10 hover:text-red-400 p-2 transition-colors"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg></button>
                                            </div>

                                            <div className="space-y-4">
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="p-4 bg-black/40 rounded-xl border border-white/5 border-l-emerald-500/50 shadow-inner">
                                                        <span className="block text-[9px] uppercase tracking-[0.2em] text-emerald-500/70 mb-1">Required monthly</span>
                                                        <span className="text-sm font-bold text-emerald-400">{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(reqSavings)}</span>
                                                    </div>
                                                    <div className={`p-4 bg-black/40 rounded-xl border border-white/5 shadow-inner ${gap > 0 ? 'border-l-amber-500/50' : 'border-l-emerald-500/50'}`}>
                                                        <span className={`block text-[9px] uppercase tracking-[0.2em] mb-1 ${gap > 0 ? 'text-amber-500/70' : 'text-emerald-500/70'}`}>Est. Gap</span>
                                                        <span className={`text-sm font-bold ${gap > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                                                            {gap > 0 ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(gap) : 'Met Target!'}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="p-4 bg-white/[0.02] rounded-xl border border-white/5">
                                                    <span className="block text-[9px] uppercase tracking-[0.2em] text-white/30 mb-2">Algorithm Suggestion</span>
                                                    <p className="text-[11px] text-white/50 leading-relaxed font-medium">
                                                        {highestDiscObj && gap > 0 ? 
                                                            `Reducing your highest variable expense (${highestDiscObj.name}) by 20% closes the gap by ₹${new Intl.NumberFormat('en-IN').format(Math.round(possibleSavings))}.` : 
                                                            `Your current trajectory comfortably supports this target!`}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </main>
    );
}
