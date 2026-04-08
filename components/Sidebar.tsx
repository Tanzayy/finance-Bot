"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { signOut, onAuthStateChanged, User } from "firebase/auth";
import { auth } from "@/lib/firebase";

const navItems = [
    { name: "Overview", href: "/dashboard" },
    { name: "Upload", href: "/upload" },
    { name: "Budgets", href: "/budgets" },
    { name: "History", href: "/statements" },
    { name: "Insights", href: "/insights" },
    { name: "Alerts", href: "/alerts" },
    { name: "Settings", href: "/settings" },
];

export default function Sidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const [userName, setUserName] = useState<string | null>(null);
    const [initials, setInitials] = useState<string>("--");

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user: User | null) => {
            if (user) {
                let nameToSet = "";
                if (user.displayName) {
                    nameToSet = user.displayName;
                } else if (user.email) {
                    const emailPrefix = user.email.split("@")[0];
                    nameToSet = emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1);
                }
                setUserName(nameToSet);
                setInitials(nameToSet.substring(0, 2).toUpperCase());
            } else {
                setUserName(null);
                setInitials("--");
            }
        });

        return () => unsubscribe();
    }, []);

    const handleSignOut = async () => {
        try {
            await signOut(auth);
            router.push("/login");
        } catch (error) {
            console.error("Error signing out:", error);
        }
    };

    return (
        <aside className="fixed top-0 left-0 h-screen w-[240px] bg-[#020202] border-r border-white/5 flex flex-col py-6 z-50 shadow-[4px_0_24px_rgba(0,0,0,0.4)]">
            {/* Minimal Profile / Status Block */}
            <div className="px-5 pb-5 mb-5 relative">
                <div className="flex items-center gap-3 relative z-10">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-gray-800 to-gray-600 flex items-center justify-center shrink-0 border border-white/10">
                        <span className="text-white text-xs font-medium">{initials}</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-sm font-medium text-white/90 tracking-tight">
                            {userName ? `Hi, ${userName}` : "Hi,"}
                        </span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/80 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                            <span className="text-xs text-white/40">Secure Session</span>
                        </div>
                    </div>
                </div>
                {/* Stylish rich horizontal line */}
                <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent shadow-[0_1px_10px_rgba(255,255,255,0.05)]" />
            </div>

            {/* Navigation links */}
            <nav className="flex-1 px-3 space-y-0.5">
                {navItems.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 text-sm ${
                                isActive
                                    ? "bg-white/[0.06] text-white font-medium"
                                    : "text-white/50 hover:text-white/90 hover:bg-white/[0.03]"
                            }`}
                        >
                            {item.name}
                        </Link>
                    );
                })}
            </nav>

            {/* Footer actions */}
            <div className="px-3 pt-6 mt-auto relative">
                {/* Stylish rich horizontal line */}
                <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent shadow-[0_-1px_10px_rgba(255,255,255,0.05)]" />
                <button
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/50 hover:text-white/90 hover:bg-white/[0.03] transition-all duration-200 text-left"
                >
                    Sign Out
                </button>
            </div>
        </aside>
    );
}
