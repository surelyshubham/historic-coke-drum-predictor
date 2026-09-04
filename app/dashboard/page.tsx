import { auth } from "@/lib/auth";
import { db } from "@/db";
import { cokeDrums, clients, inspections, physicalIndications, repairEvents } from "@/db/schema";

export default async function DashboardPage() {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role || "CLIENT";
  const isMaster = role === "MASTER";

  const drumsCount = (await db.select().from(cokeDrums)).length;
  const clientsCount = (await db.select().from(clients)).length;
  const inspectionsCount = (await db.select().from(inspections)).length;
  const indicationsList = await db.select().from(physicalIndications);
  const totalIndications = indicationsList.length;
  const activeIndications = indicationsList.filter(i => i.status === 'ACTIVE').length;
  const repairedCount = (await db.select().from(repairEvents)).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight text-slate-800">Coke Drum PAUT Platform Dashboard</h2>
        <span className="text-xs font-semibold px-3 py-1 bg-sky-100 text-sky-800 rounded-full">Phase 2 Engineering Data Model</span>
      </div>
      
      {/* Overview Stat Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-medium text-slate-500">Coke Drums Monitored</h3>
          <div className="mt-4 flex items-baseline text-3xl font-bold text-sky-600">
            {drumsCount}
          </div>
        </div>

        {isMaster && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-medium text-slate-500">Assigned Clients</h3>
            <div className="mt-4 flex items-baseline text-3xl font-bold text-sky-600">
              {clientsCount}
            </div>
          </div>
        )}

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-medium text-slate-500">Inspection Campaigns</h3>
          <div className="mt-4 flex items-baseline text-3xl font-bold text-sky-600">
            {inspectionsCount}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-medium text-slate-500">Persistent Physical Indications</h3>
          <div className="mt-4 flex items-baseline text-3xl font-bold text-sky-600">
            {totalIndications}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            <span className="text-emerald-600 font-semibold">{activeIndications} Active</span> | <span className="text-amber-600 font-semibold">{repairedCount} Repaired</span>
          </p>
        </div>

      </div>

      {/* Engineering Principles Notice */}
      <div className="rounded-xl border border-sky-100 bg-sky-50/50 p-6">
        <h3 className="text-base font-semibold text-sky-900">Engineering Principle Enforced</h3>
        <p className="mt-2 text-sm text-sky-800 leading-relaxed">
          The system explicitly distinguishes between individual <strong>Inspection Observations</strong> (single campaign measurements) and persistent <strong>Physical Indications</strong> (real-world flaws tracked across multiple campaigns like <code>PI-000001</code>).
        </p>
      </div>
    </div>
  );
}
