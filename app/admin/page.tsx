import { Settings, Shield, Key, Database, RefreshCw } from "lucide-react";

export default function AdminSettingsPage() {
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Platform Settings & Administration</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          System configurations, Cloudflare R2 storage credentials, and RBAC policies
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center">
              <Database size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Database & Cloud Backend</h3>
              <p className="text-xs text-slate-500">Neon PostgreSQL Serverless connection</p>
            </div>
          </div>
          <div className="text-xs space-y-2 text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100">
            <div className="flex justify-between">
              <span>Database Engine:</span>
              <span className="font-mono font-bold text-slate-900">Neon PostgreSQL (Drizzle ORM)</span>
            </div>
            <div className="flex justify-between">
              <span>Connection Pooling:</span>
              <span className="font-semibold text-emerald-600">Active</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
              <Key size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Cloudflare R2 Object Storage</h3>
              <p className="text-xs text-slate-500">S3-compatible raw dataset & DOCX storage</p>
            </div>
          </div>
          <div className="text-xs space-y-2 text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100">
            <div className="flex justify-between">
              <span>Storage Provider:</span>
              <span className="font-mono font-bold text-slate-900">Cloudflare R2</span>
            </div>
            <div className="flex justify-between">
              <span>Egress Fees:</span>
              <span className="font-semibold text-emerald-600">Zero Egress ($0.00)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
