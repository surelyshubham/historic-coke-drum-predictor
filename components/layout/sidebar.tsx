"use client";
import Link from "next/link";
import { LayoutDashboard, Database, Activity, FileText, Settings, Users, Upload, TrendingUp } from "lucide-react";

export function Sidebar({ role }: { role: string }) {
  const isMaster = role === "MASTER";

  return (
    <div className="w-64 bg-sky-50 text-slate-900 flex flex-col h-screen border-r border-slate-200">
      <div className="p-6">
        <h1 className="text-xl font-bold text-sky-700">Coke Drum HAT</h1>
      </div>
      <nav className="flex-1 px-4 space-y-2">
        <Link href="/dashboard" className="flex items-center space-x-3 px-3 py-2 rounded-md hover:bg-sky-100 text-sky-900 font-medium">
          <LayoutDashboard size={20} />
          <span>Dashboard</span>
        </Link>
        
        {isMaster && (
          <>
            <Link href="/clients" className="flex items-center space-x-3 px-3 py-2 rounded-md hover:bg-sky-100 text-slate-700">
              <Users size={20} />
              <span>Clients</span>
            </Link>

            <Link href="/inspections/import" className="flex items-center space-x-3 px-3 py-2 rounded-md hover:bg-sky-100 text-sky-700 font-medium">
              <Upload size={20} />
              <span>Import Dataset</span>
            </Link>
          </>
        )}

        <Link href="/analysis" className="flex items-center space-x-3 px-3 py-2 rounded-md hover:bg-sky-100 text-sky-900 font-semibold">
          <TrendingUp size={20} />
          <span>Historical Analysis</span>
        </Link>

        <Link href="/drums" className="flex items-center space-x-3 px-3 py-2 rounded-md hover:bg-sky-100 text-slate-700">
          <Database size={20} />
          <span>Coke Drums</span>
        </Link>

        <Link href="/inspections" className="flex items-center space-x-3 px-3 py-2 rounded-md hover:bg-sky-100 text-slate-700">
          <Activity size={20} />
          <span>Inspections</span>
        </Link>

        <Link href="/reports" className="flex items-center space-x-3 px-3 py-2 rounded-md hover:bg-sky-100 text-slate-700">
          <FileText size={20} />
          <span>Reports</span>
        </Link>
      </nav>
      {isMaster && (
        <div className="p-4 border-t border-slate-200">
          <Link href="/admin" className="flex items-center space-x-3 px-3 py-2 rounded-md hover:bg-sky-100 text-slate-700">
            <Settings size={20} />
            <span>Settings</span>
          </Link>
        </div>
      )}
    </div>
  );
}
