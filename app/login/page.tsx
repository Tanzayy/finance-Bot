"use client";

import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        
        if (!email || !password) {
            setError("Please fill out both fields.");
            return;
        }

        setLoading(true);

        try {
            await signInWithEmailAndPassword(auth, email, password);
            router.push("/dashboard");
        } catch (err: any) {
            // Provide clean error messages based on Firebase error codes if needed, or fallback nicely
            setError("Invalid email or password. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="min-h-screen bg-black text-white flex items-center justify-center">
            <div className="w-full max-w-md space-y-6 p-8 border border-gray-800 rounded-xl bg-neutral-950">
                <h1 className="text-3xl font-bold text-center">Login</h1>

                {error && (
                    <div className="p-3 text-sm text-red-400 bg-red-950/50 border border-red-900 rounded-lg text-center">
                        {error}
                    </div>
                )}

                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label className="block mb-2 text-sm text-gray-400">Email</label>
                        <input
                            type="email"
                            placeholder="Enter your email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            className="w-full px-4 py-3 rounded-lg bg-black border border-gray-700 outline-none focus:border-gray-500 transition-colors"
                        />
                    </div>

                    <div>
                        <label className="block mb-2 text-sm text-gray-400">Password</label>
                        <input
                            type="password"
                            placeholder="Enter your password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="w-full px-4 py-3 rounded-lg bg-black border border-gray-700 outline-none focus:border-gray-500 transition-colors"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-2 bg-[#d4d4d4] text-black rounded-lg font-bold text-[10px] uppercase tracking-widest hover:bg-gray-200 disabled:opacity-50 transition-all active:scale-95 shadow-xl shadow-white/5"
                    >
                        {loading ? "Logging in..." : "Login"}
                    </button>
                </form>
            </div>
        </main>
    );
}