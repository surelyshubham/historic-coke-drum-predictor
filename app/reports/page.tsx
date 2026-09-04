import Link from "next/link";
import { FileText, Download, Sparkles, TrendingUp, Calendar } from "lucide-react";

export default function ReportsPage() {
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-sky-100 text-sky-800 text-xs font-semibold px-2.5 py-0.5 rounded-full">Phase 7 Ready</span>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Engineering Reports</h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Automated DOCX report generation with executive summaries, 2D circumferential defect maps, and predictive lifing curves
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center">
              <FileText size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Coke Drum Turnaround Assessment Report</h3>
              <p className="text-xs text-slate-500">Comprehensive multi-campaign PAUT inspection summary</p>
            </div>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Generates standardized refinery engineering documents containing vessel specification, indication growth tracking tables, 2D weld maps, and critical wall-loss threshold projections.
          </p>
          <div className="pt-2 flex items-center gap-3">
            <Link
              href="/prediction"
              className="flex items-center gap-1.5 text-xs font-semibold bg-sky-600 text-white hover:bg-sky-700 px-4 py-2 rounded-lg shadow-xs transition"
            >
              <TrendingUp size={14} /> Review Predictive Data
            </Link>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center">
              <Sparkles size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Next Turnaround Window Recommendation</h3>
              <p className="text-xs text-slate-500">API 579 Fitness-For-Service executive lifing briefing</p>
            </div>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Ranks all active indications by days remaining until warning (80% wall) and penetration (100% wall) to schedule the next inspection outage.
          </p>
          <div className="pt-2 flex items-center gap-3">
            <Link
              href="/analysis"
              className="flex items-center gap-1.5 text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 px-4 py-2 rounded-lg transition"
            >
              <Calendar size={14} /> View Historical Comparison
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
