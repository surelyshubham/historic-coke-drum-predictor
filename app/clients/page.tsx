import { db } from "@/db";
import { clients, cokeDrums } from "@/db/schema";
import { Users, Building, Database } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  let clientList: any[] = [];
  try {
    clientList = await db.select().from(clients);
  } catch (err) {
    console.error("Failed to load clients:", err);
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Assigned Refinery Clients</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Manage refinery organizations, tenant separation, and access control
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {clientList.map((client) => (
          <div key={client.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center font-bold">
                <Building size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">{client.name}</h3>
                <p className="text-xs text-slate-500">{client.description || "Petrochemical Refinery Unit"}</p>
              </div>
            </div>
            <div className="text-xs text-slate-500 pt-2 border-t border-slate-100 flex items-center justify-between">
              <span>Tenant Status:</span>
              <span className="font-semibold text-emerald-600">Active</span>
            </div>
          </div>
        ))}
        {clientList.length === 0 && (
          <div className="col-span-full p-8 text-center text-slate-500 text-xs bg-white rounded-xl border border-slate-200">
            No clients found.
          </div>
        )}
      </div>
    </div>
  );
}
