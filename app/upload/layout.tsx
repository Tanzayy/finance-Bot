import Sidebar from "@/components/Sidebar";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-black flex">
            <Sidebar />
            <div className="flex-1 ml-[240px] min-h-screen relative overflow-x-hidden">
                {children}
            </div>
        </div>
    );
}
