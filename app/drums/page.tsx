import { db } from "@/db";
import { cokeDrums, weldJoints } from "@/db/schema";
import Link from "next/link";
import { Database, TrendingUp, LineChart, ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CokeDrumsPage() {
  let drumsList: any[] = [];
  try {
    drumsList = await db.select().from(cokeDrums);
  } catch (err) {
    console.error("Failed to load drums:", err);
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Coke Drums & Vessels</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Monitored refinery coke drum fleet with nominal wall specs and welded joints
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {drumsList.map((drum) => (
          <div key={drum.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4 hover:border-sky-300 transition">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-700 flex items-center justify-center font-bold text-xs border border-sky-100">
                  <Database size={16} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">{drum.name}</h3>
                  <p className="text-[11px] text-slate-500">{drum.material || "SA-387 Gr 22 Cl 2"}</p>
                </div>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                ACTIVE
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                <span className="text-slate-500">Nominal Wall:</span>
                <p className="font-bold text-slate-900 text-sm mt-0.5">{drum.nominalThickness ?? 32.0} mm</p>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                <span className="text-slate-500">Diameter:</span>
                <p className="font-bold text-slate-900 text-sm mt-0.5">{drum.diameter ?? 8500} mm</p>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Link
                href={`/analysis?drumId=${drum.id}`}
                className="flex-1 flex items-center justify-center gap-1 bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 py-2 rounded-lg text-xs font-semibold transition"
              >
                <TrendingUp size={13} /> Historical Analysis
              </Link>
              <Link
                href={`/prediction`}
                className="flex-1 flex items-center justify-center gap-1 bg-sky-600 text-white hover:bg-sky-700 py-2 rounded-lg text-xs font-semibold shadow-xs transition"
              >
                <LineChart size={13} /> Forecast
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
