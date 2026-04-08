"use client";

import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged, updateProfile, User } from "firebase/auth";
import PageHeader from "@/components/PageHeader";

export default function SettingsPage() {
    const [user, setUser] = useState<User | null>(null);
    const [displayName, setDisplayName] = useState("");
    const [isUpdating, setIsUpdating] = useState(false);
    const [message, setMessage] = useState("");
    const [isSendingSummary, setIsSendingSummary] = useState(false);
    const [whatsappSummaryMessage, setWhatsappSummaryMessage] = useState("");


    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            if (currentUser) {
                setUser(currentUser);
                setDisplayName(currentUser.displayName || "");
            }
        });
        return () => unsubscribe();
    }, []);

    const handleUpdateProfile = async () => {
        if (!auth.currentUser) return;
        setIsUpdating(true);
        setMessage("");
        try {
            await updateProfile(auth.currentUser, {
                displayName: displayName
            });
            setMessage("Profile updated successfully");
        } catch (error) {
            console.error("Error updating profile:", error);
            setMessage("Failed to update profile");
        } finally {
            setIsUpdating(false);
        }
    };


    const handleSendSummary = async () => {
        if (!auth.currentUser) return;
        setIsSendingSummary(true);
        setWhatsappSummaryMessage("");
        try {
            const token = await auth.currentUser.getIdToken();
            const res = await fetch("/api/twilio/summary", { 
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });
            
            const text = await res.text();
            let data;
            try {
                data = JSON.parse(text);
            } catch (e) {
                setWhatsappSummaryMessage(`Server returned non-JSON response (Status: ${res.status}). Check backend logs.`);
                return;
            }

            if (data.success) {
                setWhatsappSummaryMessage(data.message);
            } else {
                setWhatsappSummaryMessage(data.error || "Error sending summary.");
            }
        } catch (error) {
            console.error(error);
            setWhatsappSummaryMessage("Error sending summary.");
        } finally {
            setIsSendingSummary(false);
        }
    };


    return (
        <main className="page-main">
            <div className="page-content">
                <PageHeader 
                    title="Settings" 
                    subtitle="Manage your profile and app preferences."
                />

                <div className="space-y-10">
                    {/* Profile Section */}
                    <section className="space-y-6">
                        <h3 className="text-[10px] font-bold tracking-[0.3em] uppercase text-white/20 px-1">Your Profile</h3>
                        <div className="rounded-3xl border border-white/[0.06] bg-white/[0.01] p-8 space-y-8">
                            <div className="flex flex-col md:flex-row md:items-center gap-8">
                                <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-white/10 to-white/5 border border-white/10 flex items-center justify-center shrink-0 shadow-2xl">
                                    <span className="text-2xl font-semibold text-white/40">
                                        {displayName ? displayName.substring(0, 2).toUpperCase() : "--"}
                                    </span>
                                </div>
                                <div className="flex-1 space-y-4">
                                    <div className="grid gap-2">
                                        <label className="text-[10px] font-bold text-white/20 uppercase tracking-widest pl-0.5">Display Name</label>
                                        <input 
                                            type="text" 
                                            value={displayName}
                                            onChange={(e) => setDisplayName(e.target.value)}
                                            placeholder="Your name"
                                            className="w-full bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-white/20 transition-all placeholder-white/10"
                                        />
                                    </div>
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="space-y-0.5">
                                            <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest pl-0.5">Email Address</p>
                                            <p className="text-xs text-white/40 font-mono">{user?.email || "loading..."}</p>
                                        </div>
                                        <button 
                                            onClick={handleUpdateProfile}
                                            disabled={isUpdating}
                                            className="px-6 py-2.5 bg-white text-black rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-gray-200 transition-all active:scale-95 disabled:opacity-30"
                                        >
                                            {isUpdating ? "Saving..." : "Update"}
                                        </button>
                                    </div>
                                    {message && <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest pt-2">{message}</p>}
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Workspace Section */}
                    <section className="space-y-6">
                        <h3 className="text-[10px] font-bold tracking-[0.3em] uppercase text-white/20 px-1">App Preferences</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="rounded-2xl border border-white/[0.04] bg-white/[0.005] p-6 space-y-4 group hover:bg-white/[0.015] transition-all">
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Base Currency</span>
                                    <span className="text-[9px] font-bold text-emerald-400/50 bg-emerald-500/5 border border-emerald-500/10 px-2 py-0.5 rounded uppercase tracking-tighter">Locked</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium text-white/90">Indian Rupee (INR)</span>
                                    <span className="text-lg text-white/20 font-light">₹</span>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-white/[0.04] bg-white/[0.005] p-6 space-y-4 group hover:bg-white/[0.015] transition-all cursor-not-allowed">
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">App Theme</span>
                                    <span className="text-[9px] font-bold text-white/10 border border-white/5 px-2 py-0.5 rounded uppercase tracking-tighter">Auto</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium text-white/40">OLED Black (Default)</span>
                                    <div className="w-4 h-4 rounded-full border border-white/20 bg-black shadow-inner" />
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Integrations Section */}
                    <section className="space-y-6">
                        <h3 className="text-[10px] font-bold tracking-[0.3em] uppercase text-white/20 px-1">Integrations</h3>
                        <div className="rounded-2xl border border-white/[0.04] bg-white/[0.005] p-6 space-y-8 group hover:bg-white/[0.015] transition-all">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div className="space-y-0.5">
                                    <span className="text-sm font-medium text-white/60">Real Financial Summary</span>
                                    <p className="text-[10px] text-white/20 uppercase tracking-widest">Sends actual MTD data to WhatsApp</p>
                                </div>
                                <button 
                                    onClick={handleSendSummary}
                                    disabled={isSendingSummary}
                                    className="px-6 py-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-emerald-500/20 transition-all active:scale-95 disabled:opacity-30 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.05)]"
                                >
                                    {isSendingSummary ? "Sending..." : "Send Current Summary"}
                                </button>
                            </div>
                            {whatsappSummaryMessage && (
                                <p className={`text-sm font-medium pt-2 ${whatsappSummaryMessage.toLowerCase().includes("success") || whatsappSummaryMessage.toLowerCase().includes("sent") ? "text-green-400" : "text-red-400"}`}>
                                    {whatsappSummaryMessage}
                                </p>
                            )}

                        </div>
                    </section>

                    {/* Security Summary */}
                    <section className="pt-4">
                        <div className="rounded-2xl border border-white/5 bg-white/[0.01] p-6 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-full bg-emerald-500/5 border border-emerald-500/10 flex items-center justify-center">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400/80"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                                </div>
                                <div className="space-y-0.5">
                                    <p className="text-[11px] font-bold text-white/80 uppercase tracking-wider">Your Data is Safe</p>
                                </div>
                            </div>
                            <span className="text-[9px] font-bold text-white/10 uppercase tracking-widest">v1.2.0-stable</span>
                        </div>
                    </section>
                </div>
            </div>
        </main>
    );
}
