"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

type PageHeaderProps = {
    title: string;
    subtitle?: string;
    backHref?: string;
    showBack?: boolean;
};

export default function PageHeader({
    title,
    subtitle,
    backHref,
    showBack = true,
}: PageHeaderProps) {
    const router = useRouter();

    const buttonClasses = "group relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-white/50 backdrop-blur-md transition-all duration-300 hover:border-white/20 hover:bg-white/[0.08] hover:text-white hover:shadow-[0_0_15px_rgba(255,255,255,0.05)] active:scale-95 md:-ml-12 lg:-ml-14";
    const backIcon = <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-300 group-hover:-translate-x-0.5"><path d="m15 18-6-6 6-6"/></svg>;

    return (
        <div className="space-y-4 mb-6 md:mb-8">
            <div className="flex items-center gap-3 md:gap-4">
                {showBack && (
                    backHref ? (
                        <Link href={backHref} className={buttonClasses}>
                            {backIcon}
                        </Link>
                    ) : (
                        <button type="button" onClick={() => router.back()} className={buttonClasses.replace('h-11 w-11', 'h-9 w-9')}>
                            {backIcon}
                        </button>
                    )
                )}

                <div>
                    <h1 className="text-2xl md:text-3xl font-semibold tracking-tight bg-gradient-to-br from-white to-white/50 bg-clip-text text-transparent pb-0.5">
                        {title}
                    </h1>
                    {subtitle && (
                        <p className="mt-0.5 text-[11px] md:text-xs text-white/30 tracking-widest font-bold uppercase">{subtitle}</p>
                    )}
                </div>
            </div>

            <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-white/10 to-transparent shadow-[0_1px_15px_rgba(255,255,255,0.05)]" />
        </div>
    );
}