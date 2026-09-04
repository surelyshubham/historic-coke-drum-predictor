import { db } from "@/db";
import { inspections, cokeDrums } from "@/db/schema";
import Link from "next/link";
import { Activity, Upload, TrendingUp, Calendar, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function InspectionsIndexPage() {
  let inspectionList: any[] = [];
  try {
    inspectionList = await db.select().from(inspections);
  } catch (err) {
    console.error("Failed to load inspections:", err);
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Inspection Campaigns</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            PAUT and DRM inspection datasets recorded across turnaround campaigns
          </p>
        </div>
        <Link
          href="/inspections/import"
          className="flex items-center gap-1.5 bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-xs transition"
        >
          <Upload size={14} />
          <span>Import Dataset</span>
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Total Campaigns: {inspectionList.length}
          </span>
        </div>

        <div className="divide-y divide-slate-100">
          {inspectionList.map((insp) => (
            <div key={insp.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-sky-50 text-sky-700 flex items-center justify-center font-bold text-xs border border-sky-100">
                  <Calendar size={18} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">{insp.campaignName}</h4>
                  <p className="text-xs text-slate-500">
                    Date: {new Date(insp.inspectionDate).toISOString().split("T")[0]} | Method: {insp.inspectionType || "PAUT/DRM"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href="/analysis"
                  className="flex items-center gap-1 text-xs font-semibold text-sky-700 hover:text-sky-900 bg-sky-50 px-3 py-1.5 rounded-lg border border-sky-100 transition"
                >
                  Analyze <ArrowRight size={12} />
                </Link>
              </div>
            </div>
          ))}
          {inspectionList.length === 0 && (
            <div className="p-8 text-center text-slate-500 text-xs">
              No inspection campaigns found. Upload your first dataset using the Import button.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
