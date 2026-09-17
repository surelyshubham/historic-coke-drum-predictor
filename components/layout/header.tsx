"use client";
import Link from "next/link";
import { LogOut, User, Palette } from "lucide-react";

export function Header({ userName, role }: { userName: string; role: string }) {
  return (
    <header className="h-16 border-b border-slate-200 bg-white flex items-center justify-between px-6 shrink-0 z-10">
      <div className="flex items-center gap-4">
        {/* SIGMA NDT Services Inc. Official Logo */}
        <Link href="/dashboard" className="flex items-center gap-3 transition hover:opacity-90">
          <img
            src="/images/sigma_ndt_logo.png"
            alt="SIGMA NDT Services Inc."
            className="h-9 w-auto object-contain"
          />
        </Link>
        <div className="h-6 w-px bg-slate-200 hidden sm:block" />
        <div className="font-semibold text-slate-800 text-xs hidden sm:flex items-center gap-2">
          <span className="text-slate-500">Coke Drum HAT</span>
          <span className="text-sky-700 text-[11px] px-2 py-0.5 bg-sky-50 border border-sky-200 rounded-full font-bold">{role}</span>
        </div>
      </div>

      <div className="flex items-center space-x-3">
        {/* Quick Color Codes Setup Shortcut Button */}
        <Link
          href="/admin"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50/80 text-slate-700 hover:bg-slate-100 hover:text-slate-900 text-xs font-bold transition shadow-2xs"
          title="Configure PAUT Defect Severity Colors & Depth Scales"
        >
          <Palette size={15} className="text-violet-600" />
          <span className="hidden sm:inline">Color Codes</span>
        </Link>

        <div className="flex items-center space-x-2 text-slate-600 pl-2">
          <User size={18} />
          <span className="text-xs font-semibold text-slate-700">{userName}</span>
        </div>

        <button 
          onClick={() => { /* NextAuth signOut goes here */ }}
          className="p-2 text-slate-500 hover:text-red-600 rounded-full hover:bg-slate-100 transition-colors"
          title="Sign Out"
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}
