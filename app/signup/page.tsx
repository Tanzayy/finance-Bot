"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import PageHeader from "@/components/PageHeader";

export default function SignupPage() {
    const router = useRouter();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            await createUserWithEmailAndPassword(auth, email, password);
            router.push("/dashboard");
        } catch (error: any) {
            setError(error?.message || "Signup failed");
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="min-h-screen bg-black text-white">
            <div className="mx-auto max-w-3xl px-6 py-10 md:px-10 md:py-12 space-y-10">
                <PageHeader
                    title="Create Account"
                    subtitle="Secure access to your personal finance workspace."
                    backHref="/"
                />

                <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.08] to-white/[0.03] p-8 md:p-10 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
                    <form onSubmit={handleSignup} className="space-y-6">
                        <div>
                            <label className="mb-2 block text-sm uppercase tracking-[0.15em] text-white/45">
                                Email
                            </label>
                            <input
                                type="email"
                                placeholder="Enter your email"
                                className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-4 outline-none transition placeholder:text-white/25 focus:border-white/25"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>

                        <div>
                            <label className="mb-2 block text-sm uppercase tracking-[0.15em] text-white/45">
                                Password
                            </label>
                            <input
                                type="password"
                                placeholder="Enter your password"
                                className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-4 outline-none transition placeholder:text-white/25 focus:border-white/25"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>

                        {error ? (
                            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                                {error}
                            </div>
                        ) : null}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full rounded-xl bg-white py-2 text-black font-bold text-[10px] uppercase tracking-widest transition-all hover:bg-gray-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 shadow-xl shadow-white/5"
                        >
                            {loading ? "Creating account..." : "Sign Up"}
                        </button>
                    </form>
                </div>
            </div>
        </main>
    );
}