"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  LayoutDashboard, 
  Database, 
  Activity, 
  FileText, 
  Settings, 
  Users, 
  Upload, 
  TrendingUp, 
  GitMerge,
  LineChart
} from "lucide-react";

export function Sidebar({ role }: { role: string }) {
  const pathname = usePathname();
  const isMaster = role === "MASTER";

  const isActive = (path: string) => {
    if (path === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(path);
  };

  const navLinkClass = (path: string) => {
    const active = isActive(path);
    return `flex items-center space-x-3 px-3.5 py-2.5 rounded-lg text-xs font-semibold transition-all ${
      active
        ? "bg-sky-600 text-white shadow-xs"
        : "text-slate-700 hover:bg-sky-100/70 hover:text-sky-900"
    }`;
  };

  return (
    <aside className="w-64 bg-sky-50/70 text-slate-900 flex flex-col h-screen border-r border-slate-200 shrink-0 select-none">
      {/* Platform Branding */}
      <div className="p-6 border-b border-slate-200/60 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-sky-600 flex items-center justify-center text-white font-bold shadow-xs">
          CD
        </div>
        <div>
          <h1 className="text-base font-bold text-sky-900 leading-tight">Coke Drum HAT</h1>
          <p className="text-[10px] text-slate-500 font-medium">PAUT Historical Analysis</p>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <Link href="/dashboard" className={navLinkClass("/dashboard")}>
          <LayoutDashboard size={18} />
          <span>Dashboard</span>
        </Link>
        
        {isMaster && (
          <>
            <Link href="/clients" className={navLinkClass("/clients")}>
              <Users size={18} />
              <span>Clients</span>
            </Link>

            <Link href="/inspections/import" className={navLinkClass("/inspections/import")}>
              <Upload size={18} />
              <span>Import Dataset</span>
            </Link>

            <Link href="/matching" className={navLinkClass("/matching")}>
              <GitMerge size={18} />
              <span>Indication Matching</span>
            </Link>
          </>
        )}

        <Link href="/analysis" className={navLinkClass("/analysis")}>
          <TrendingUp size={18} />
          <span>Historical Analysis</span>
        </Link>

        <Link href="/prediction" className={navLinkClass("/prediction")}>
          <LineChart size={18} />
          <span>Predictive Modeling</span>
        </Link>

        <Link href="/drums" className={navLinkClass("/drums")}>
          <Database size={18} />
          <span>Coke Drums</span>
        </Link>

        <Link href="/inspections" className={navLinkClass("/inspections")}>
          <Activity size={18} />
          <span>Inspections</span>
        </Link>

        <Link href="/reports" className={navLinkClass("/reports")}>
          <FileText size={18} />
          <span>Reports</span>
        </Link>
      </nav>

      {/* Footer Settings */}
      {isMaster && (
        <div className="p-3 border-t border-slate-200/60">
          <Link href="/admin" className={navLinkClass("/admin")}>
            <Settings size={18} />
            <span>Settings & Admin</span>
          </Link>
        </div>
      )}
    </aside>
  );
}
