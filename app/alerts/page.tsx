"use client";

import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import PageHeader from "@/components/PageHeader";
import { onAuthStateChanged } from "firebase/auth";

export default function AlertsPage() {
    const [alerts, setAlerts] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchAlerts = async (uid: string) => {
        try {
            const q = query(collection(db, "alerts"), where("userId", "==", uid));
            const snapshot = await getDocs(q);
            const fetchedAlerts: any[] = [];
            snapshot.forEach(doc => {
                fetchedAlerts.push({ id: doc.id, ...doc.data() });
            });
            
            fetchedAlerts.sort((a, b) => {
                 const aTime = a.createdAt ? a.createdAt.toMillis() : 0;
                 const bTime = b.createdAt ? b.createdAt.toMillis() : 0;
                 return bTime - aTime;
            });
            
            setAlerts(fetchedAlerts);
        } catch (error) {
            console.error("Error fetching alerts: ", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                fetchAlerts(user.uid);
            } else {
                setAlerts([]);
                setIsLoading(false);
            }
        });
        return () => unsubscribe();
    }, []);

    const handleResolve = async (alertId: string) => {
        try {
            const alertRef = doc(db, "alerts", alertId);
            await updateDoc(alertRef, {
                status: "resolved",
                resolvedAt: serverTimestamp()
            });
            // Local update
            setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, status: "resolved" } : a));
        } catch (error) {
            console.error("Error resolving alert:", error);
        }
    };

    return (
        <main className="page-main">
            <div className="page-content">
                <PageHeader 
                    title="Alerts" 
                />

                {isLoading ? (
                    <div className="flex items-center justify-center p-12 min-h-[400px]">
                        <p className="text-white/40 animate-pulse text-sm">Checking for updates...</p>
                    </div>
                ) : alerts.length === 0 ? (
                    <section className="flex flex-col items-center justify-center p-12 text-center rounded-2xl border border-white/[0.06] bg-white/[0.02] min-h-[400px]">
                        <div className="w-16 h-16 rounded-full border border-white/[0.04] bg-white/[0.02] flex items-center justify-center mb-6">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-white/30">
                                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                                <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                            </svg>
                        </div>
                        <h2 className="text-lg font-medium text-white/90 mb-2">No Active Alerts</h2>
                        <p className="text-sm text-white/40 max-w-sm leading-relaxed">
                            Everything looks good. We'll let you know if you go over budget or if we see any unusual activity.
                        </p>
                    </section>
                ) : (
                    <section className="space-y-3">
                        <div className="flex items-center justify-between px-2 mb-6">
                            <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-white/20">Recent Activity</span>
                            <span className="text-[10px] font-medium text-white/10 italic">Live updates</span>
                        </div>
                        {alerts.map((alert) => (
                            <div key={alert.id} className={`rounded-xl border ${alert.status === 'resolved' ? 'border-white/[0.03] bg-white/[0.005]' : 'border-white/[0.06] bg-white/[0.015]'} p-5 transition-all duration-300 flex items-start gap-5 group`}>
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border ${alert.status === 'resolved' ? 'border-white/5 bg-white/5 opacity-50' : alert.severity === 'high' ? 'border-red-500/20 bg-red-500/10' : 'border-amber-500/20 bg-amber-500/10'}`}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={alert.status === 'resolved' ? 'text-white/20' : alert.severity === 'high' ? 'text-red-400' : 'text-amber-400'}>
                                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                                    </svg>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between mb-1.5">
                                        <h3 className={`text-xs font-semibold tracking-tight ${alert.status === 'resolved' ? 'text-white/30' : 'text-white/90'}`}>
                                            {alert.type === 'overspend' ? 'Over Budget' : 'Security Alert'}
                                        </h3>
                                        <div className="flex items-center gap-3">
                                            <span className="text-[10px] font-bold tracking-wider text-white/20 uppercase">
                                                {alert.createdAt ? new Date(alert.createdAt.toMillis()).toLocaleDateString('en-IN', {
                                                    month: 'short', day: 'numeric'
                                                }) : 'Just now'}
                                            </span>
                                            {alert.status === 'active' && (
                                                <button 
                                                    onClick={() => handleResolve(alert.id)}
                                                    className="opacity-0 group-hover:opacity-100 px-3 py-1 bg-white/5 hover:bg-white/10 text-[9px] font-bold text-white/40 hover:text-emerald-400 border border-white/5 rounded-md uppercase tracking-[0.15em] transition-all"
                                                >
                                                    Resolve
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <p className={`text-[12px] leading-relaxed max-w-[600px] ${alert.status === 'resolved' ? 'text-white/20 line-through decoration-white/10' : 'text-white/50'}`}>
                                        {alert.message}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </section>
                )}
            </div>
        </main>
    );
}
