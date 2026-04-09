import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center">
      <div className="text-center space-y-6">
        <h1 className="text-4xl font-bold">Finance Bot</h1>

        <p className="text-gray-400">
          Upload bank statements. Track spending. Stay in control.
        </p>

        <div className="flex gap-4 justify-center">
          <Link
            href="/signup"
            className="px-5 py-2 bg-[#d4d4d4] text-black rounded-lg font-bold text-[10px] uppercase tracking-widest hover:bg-gray-200 transition-all active:scale-95 text-center"
          >
            Sign Up
          </Link>

          <Link
            href="/login"
            className="px-5 py-2 border border-white/20 rounded-lg font-bold text-[10px] uppercase tracking-widest hover:bg-white/[0.05] transition-all active:scale-95 text-center"
          >
            Login
          </Link>
        </div>
      </div>
    </main>
  );
}