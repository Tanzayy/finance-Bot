"use client";
 
import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import PageHeader from "@/components/PageHeader";
import { getMonthYear, MONTH_NAMES } from "@/lib/finance-utils";
import { 
    ResponsiveContainer, 
    PieChart, 
    Pie, 
    Cell, 
    BarChart, 
    Bar, 
    XAxis, 
    YAxis, 
    Tooltip, 
    AreaChart, 
    Area 
} from 'recharts';

const CHART_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6'];

export default function InsightsPage() {
    const [isLoading, setIsLoading] = useState(true);
    const [insights, setInsights] = useState<{
        topCategories: {name: string, value: number, percentage: number}[],
        merchantMetrics: {name: string, count: number, total: number}[],
        velocity: {daily: number, weekly: number},
        trendData: {date: string, amount: number}[]
    } | null>(null);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                try {
                    const q = query(collection(db, "transactions"), where("userId", "==", user.uid), where("type", "==", "debit"));
                    const snapshot = await getDocs(q);
                    
                    const catMap: Record<string, number> = {};
                    const merchMap: Record<string, {count: number, total: number}> = {};
                    let totalSpend = 0;
                    let firstDate = new Date();
                    let lastDate = new Date(0);

                    snapshot.forEach(doc => {
                        const data = doc.data();
                        const amt = data.amount || 0;
                        totalSpend += amt;
                        
                        const cat = data.category || "Uncategorized";
                        catMap[cat] = (catMap[cat] || 0) + amt;
                        
                        const merch = data.description || "Vendor";
                        if (!merchMap[merch]) merchMap[merch] = { count: 0, total: 0 };
                        merchMap[merch].count++;
                        merchMap[merch].total += amt;

                        // Date range for velocity
                        const { day, month, year } = getMonthYear(data.date);
                        const d = new Date(year, month, day);
                        if (d < firstDate) firstDate = d;
                        if (d > lastDate) lastDate = d;
                    });

                    // Calculate trend for sparklines
                    const trendMap: Record<string, number> = {};
                    snapshot.forEach(doc => {
                        const d = doc.data().date;
                        trendMap[d] = (trendMap[d] || 0) + (doc.data().amount || 0);
                    });
                    const trendData = Object.entries(trendMap)
                        .map(([date, amount]) => ({ date, amount }))
                        .sort((a, b) => {
                            const da = getMonthYear(a.date);
                            const db = getMonthYear(b.date);
                            return new Date(da.year, da.month, da.day).getTime() - new Date(db.year, db.month, db.day).getTime();
                        })
                        .slice(-14); // Last 14 snapshots

                    const days = Math.max(1, Math.ceil((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)));
                    
                    setInsights({
                        topCategories: Object.entries(catMap)
                            .map(([name, value]) => ({ name, value, percentage: (value / totalSpend) * 100 }))
                            .sort((a, b) => b.value - a.value)
                            .slice(0, 4),
                        merchantMetrics: Object.entries(merchMap)
                            .map(([name, stats]) => ({ name, ...stats }))
                            .sort((a, b) => b.total - a.total)
                            .slice(0, 5),
                        velocity: {
                            daily: totalSpend / days,
                            weekly: (totalSpend / days) * 7
                        },
                        trendData
                    });
                } catch (error) {
                    console.error("Error generating insights:", error);
                } finally {
                    setIsLoading(false);
                }
            } else {
                setIsLoading(false);
            }
        });
        return () => unsubscribe();
    }, []);

    if (isLoading) {
        return (
            <main className="min-h-screen bg-black text-white p-6 lg:p-10 flex items-center justify-center">
                <p className="text-white/20 animate-pulse text-xs font-bold uppercase tracking-widest">Aggregating Patterns...</p>
            </main>
        );
    }

    return (
        <main className="page-main">
            <div className="page-content">
                <PageHeader 
                    title="Spending Insights" 
                />

                {!insights || insights.topCategories.length === 0 ? (
                    <section className="flex flex-col items-center justify-center p-12 text-center rounded-3xl border border-white/[0.06] bg-[#242424] min-h-[400px] space-y-6">
                        <div className="w-12 h-12 rounded-full border border-white/[0.04] bg-white/[0.02] flex items-center justify-center">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-white/20">
                                <line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line>
                            </svg>
                        </div>
                        <div className="space-y-2">
                            <h2 className="text-[11px] font-bold text-white/40 uppercase tracking-[0.2em]">Not Enough Data</h2>
                            <p className="text-[11px] text-white/20 max-w-xs mx-auto leading-relaxed font-medium">
                                We need more transaction history to show you meaningful trends.
                            </p>
                        </div>
                    </section>
                ) : (
                    <div className="grid gap-10 lg:grid-cols-12">
                        {/* Dominance Categories Visualized */}
                        <section className="lg:col-span-12 space-y-8">
                            <h3 className="text-[10px] font-bold tracking-[0.3em] uppercase text-white/40 px-1 border-l border-indigo-500/20 pl-3">Spending Breakdown</h3>
                            
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center bg-[#242424] border border-white/[0.04] p-10 rounded-[2.5rem]">
                                <div className="h-[280px] w-full relative group">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={insights.topCategories}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={80}
                                                outerRadius={110}
                                                paddingAngle={8}
                                                dataKey="value"
                                                isAnimationActive={true}
                                                animationDuration={1000}
                                                stroke="none"
                                            >
                                                {insights.topCategories.map((entry, index) => (
                                                    <Cell 
                                                        key={`cell-${index}`} 
                                                        fill={CHART_COLORS[index % CHART_COLORS.length]}
                                                        className="hover:opacity-80 transition-opacity cursor-pointer shadow-xl underline"
                                                    />
                                                ))}
                                            </Pie>
                                            <Tooltip 
                                                content={({ active, payload }) => {
                                                    if (active && payload && payload.length) {
                                                        return (
                                                            <div className="bg-neutral-900/90 backdrop-blur-xl border border-white/10 p-3 rounded-xl shadow-2xl">
                                                                <p className="text-[10px] font-bold text-white/40 uppercase mb-1">{payload[0].name}</p>
                                                                <p className="text-sm font-semibold">₹{new Intl.NumberFormat('en-IN').format(Math.round(Number(payload[0].value) || 0))}</p>
                                                            </div>
                                                        );
                                                    }
                                                    return null;
                                                }}
                                            />
                                        </PieChart>
                                    </ResponsiveContainer>
                                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                        <span className="text-[9px] font-bold text-white/20 uppercase tracking-[0.3em] mb-1">Top</span>
                                        <span className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-b from-white to-white/40 tracking-tighter">Category</span>
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    {insights.topCategories.map((cat, idx) => (
                                        <div key={idx} className="flex justify-between items-center group cursor-default">
                                            <div className="flex items-center gap-4">
                                                <div className="w-2 h-2 rounded-full shadow-[0_0_8px_rgba(255,255,255,0.2)]" style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }} />
                                                <span className="text-[11px] font-bold text-white/40 uppercase tracking-wider group-hover:text-white/80 transition-colors">{cat.name}</span>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-xs font-semibold text-white/80">₹{new Intl.NumberFormat('en-IN').format(Math.round(cat.value))}</span>
                                                <span className="ml-3 text-[10px] font-bold text-white/10 italic">{Math.round(cat.percentage)}%</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </section>

                        {/* Merchant Distribution Visualized */}
                        <section className="lg:col-span-7 space-y-8">
                            <h3 className="text-[10px] font-bold tracking-[0.3em] uppercase text-white/40 px-1 border-l border-emerald-500/20 pl-3">Top Merchants</h3>
                            <div className="h-[320px] w-full bg-[#242424] border border-white/[0.04] p-8 rounded-[2.5rem] relative overflow-hidden group">
                                <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={insights.merchantMetrics} layout="vertical" margin={{ left: -10, right: 30 }}>
                                        <XAxis type="number" hide />
                                        <YAxis 
                                            dataKey="name" 
                                            type="category" 
                                            axisLine={false} 
                                            tickLine={false} 
                                            width={150}
                                            tick={({ x, y, payload }) => (
                                                <g transform={`translate(${x},${y})`}>
                                                    <text 
                                                        x={0} 
                                                        y={0} 
                                                        dy={4} 
                                                        textAnchor="end" 
                                                        fill="rgba(255, 255, 255, 0.3)" 
                                                        style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase' }}
                                                    >
                                                        {payload.value.length > 20 ? `${payload.value.substring(0, 18)}...` : payload.value}
                                                    </text>
                                                </g>
                                            )}
                                        />
                                        <Tooltip 
                                            cursor={{ fill: 'rgba(255, 255, 255, 0.02)' }}
                                            content={({ active, payload }) => {
                                                if (active && payload && payload.length) {
                                                    return (
                                                        <div className="bg-neutral-900 border border-white/10 p-3 rounded-xl shadow-2xl">
                                                            <p className="text-xs font-bold text-white mb-1">{payload[0].payload.name}</p>
                                                            <p className="text-[10px] text-white/40 tracking-wider">₹{new Intl.NumberFormat('en-IN').format(Math.round(Number(payload[0].value) || 0))}</p>
                                                        </div>
                                                    );
                                                }
                                                return null;
                                            }}
                                        />
                                        <Bar 
                                            dataKey="total" 
                                            radius={[0, 8, 8, 0]} 
                                            barSize={16}
                                            isAnimationActive={true}
                                        >
                                            {insights.merchantMetrics.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={CHART_COLORS[1]} fillOpacity={0.8 - (index * 0.12)} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </section>

                        <aside className="lg:col-span-5 flex flex-col gap-8">
                            <h3 className="text-[10px] font-bold tracking-[0.3em] uppercase text-white/40 px-1 border-l border-white/10 pl-3">Spending Trend</h3>
                            <div className="flex-1 flex flex-col gap-6">
                                <div className="flex-1 p-8 rounded-[2.5rem] border border-white/[0.06] bg-gradient-to-br from-white/[0.03] to-transparent relative overflow-hidden group flex flex-col justify-center min-h-[135px]">
                                    <div className="relative z-10 pl-2">
                                        <p className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                            Daily Average
                                        </p>
                                        <p className="text-4xl font-semibold tracking-tighter text-white/90 mb-1">₹{Math.round(insights.velocity.daily)}</p>
                                        <p className="text-[9px] font-bold text-white/10 uppercase tracking-widest">Calculated over last 14 days</p>
                                    </div>
                                </div>
                                <div className="flex-1 p-8 rounded-[2.5rem] border border-white/[0.06] bg-[#242424] relative overflow-hidden group flex flex-col justify-center min-h-[135px]">
                                    <div className="relative z-10 pl-2">
                                        <p className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                            Weekly Average
                                        </p>
                                        <p className="text-4xl font-semibold tracking-tighter text-white/90 mb-1">₹{Math.round(insights.velocity.weekly)}</p>
                                        <p className="text-[9px] font-bold text-white/10 uppercase tracking-widest">Calculated over last 14 days</p>
                                    </div>
                                </div>
                            </div>
                        </aside>
                    </div>
                )}
            </div>
        </main>
    );
}
