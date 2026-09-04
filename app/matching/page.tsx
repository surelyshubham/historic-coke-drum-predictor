"use client";

import { useState, useEffect } from "react";
import { 
  getMatchingOverviewData, 
  confirmMatchAction, 
  rejectMatchAction, 
  overrideMatchAction, 
  createNewPhysicalIndicationFromMatchAction 
} from "./actions";
import { 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Edit3, 
  PlusCircle, 
  History, 
  Search, 
  Filter, 
  Layers, 
  Info,
  ShieldCheck,
  ArrowRight
} from "lucide-react";

export default function IndicationMatchingPage() {
  const [drumId, setDrumId] = useState<number>(1);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Modal States
  const [overrideModalMatch, setOverrideModalMatch] = useState<any>(null);
  const [targetPiId, setTargetPiId] = useState<number | "">("");
  const [overrideReason, setOverrideReason] = useState("");

  const [newPiModalMatch, setNewPiModalMatch] = useState<any>(null);
  const [newPiCode, setNewPiCode] = useState("");
  const [newPiReason, setNewPiReason] = useState("");

  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadData(drumId);
  }, [drumId]);

  const loadData = async (id: number) => {
    setLoading(true);
    try {
      const res = await getMatchingOverviewData(id);
      setData(res);
    } catch (err) {
      console.error("Failed to load matching data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (matchId: number) => {
    setActionLoading(true);
    try {
      await confirmMatchAction(matchId);
      await loadData(drumId);
    } catch (err) {
      alert("Failed to confirm match");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (matchId: number) => {
    const reason = prompt("Enter engineering reason for rejection:", "Distance discrepancy / false positive candidate");
    if (!reason) return;
    setActionLoading(true);
    try {
      await rejectMatchAction(matchId, reason);
      await loadData(drumId);
    } catch (err) {
      alert("Failed to reject match");
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenOverride = (match: any) => {
    setOverrideModalMatch(match);
    setTargetPiId(data?.pis[0]?.id || "");
    setOverrideReason(`Reassigning observation #${match.observationId} to correct physical flaw entity`);
  };

  const submitOverride = async () => {
    if (!overrideModalMatch || !targetPiId || !overrideReason) return;
    setActionLoading(true);
    try {
      await overrideMatchAction(overrideModalMatch.id, Number(targetPiId), overrideReason);
      setOverrideModalMatch(null);
      await loadData(drumId);
    } catch (err) {
      alert("Failed to override match");
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenNewPi = (match: any) => {
    setNewPiModalMatch(match);
    const suggestedCode = `PI-${match.weldName}-${match.circumferentialPosition}`;
    setNewPiCode(suggestedCode);
    setNewPiReason("New physical indication detected; distinct flaw progression");
  };

  const submitNewPi = async () => {
    if (!newPiModalMatch || !newPiCode || !newPiReason) return;
    setActionLoading(true);
    try {
      await createNewPhysicalIndicationFromMatchAction(newPiModalMatch.id, newPiCode, drumId, newPiReason);
      setNewPiModalMatch(null);
      await loadData(drumId);
    } catch (err) {
      alert("Failed to create new physical indication");
    } finally {
      setActionLoading(false);
    }
  };

  const matches = data?.matches || [];
  const filteredMatches = matches.filter((m: any) => {
    if (statusFilter === "REVIEW" && m.status !== "AUTOMATIC" && m.confidenceLevel !== "MEDIUM") return false;
    if (statusFilter === "CONFIRMED" && m.status !== "CONFIRMED") return false;
    if (statusFilter === "OVERRIDDEN" && m.status !== "OVERRIDDEN") return false;
    if (statusFilter === "REJECTED" && m.status !== "REJECTED") return false;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const code = m.physicalIndicationCode.toLowerCase();
      const weld = m.weldName.toLowerCase();
      const camp = m.campaignName.toLowerCase();
      if (!code.includes(q) && !weld.includes(q) && !camp.includes(q)) return false;
    }

    return true;
  });

  const reviewCount = matches.filter((m: any) => m.status === "AUTOMATIC" || m.confidenceLevel === "MEDIUM").length;
  const confirmedCount = matches.filter((m: any) => m.status === "CONFIRMED").length;
  const overriddenCount = matches.filter((m: any) => m.status === "OVERRIDDEN").length;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold px-2.5 py-0.5 bg-sky-100 text-sky-800 rounded-full">Phase 5</span>
            <h2 className="text-xl font-bold text-slate-900">Indication Matching & Manual Override Engine</h2>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Audit automated spatial correlation, confirm candidates, resolve conflicts, and promote new flaw entities.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <label className="text-xs font-semibold text-slate-600">Coke Drum:</label>
          <select 
            value={drumId} 
            onChange={(e) => setDrumId(Number(e.target.value))}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold text-sky-800 bg-sky-50 focus:ring-1 focus:ring-sky-500 focus:outline-none"
          >
            <option value={1}>C04 — Delayed Coking Unit</option>
          </select>
        </div>
      </div>

      {/* Engineering Rule Notice */}
      <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-4 text-xs text-sky-950 flex items-start space-x-3">
        <ShieldCheck className="text-sky-600 shrink-0 mt-0.5" size={18} />
        <div>
          <strong className="font-semibold">Engineering Immutability Guarantee:</strong>
          <p className="text-sky-800 mt-0.5">
            Raw inspection observation records are <strong>permanently immutable</strong>. Manual overrides strictly alter the association link (<code>indication_matches</code>) between the observation and the persistent <code>physical_indications</code> entity with a permanent audit trail.
          </p>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-xs font-semibold text-slate-500">Total Correlated Matches</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{matches.length}</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-amber-200 shadow-sm bg-amber-50/30">
          <p className="text-xs font-semibold text-amber-700">Review Required</p>
          <p className="text-2xl font-bold text-amber-800 mt-1">{reviewCount}</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-emerald-200 shadow-sm bg-emerald-50/30">
          <p className="text-xs font-semibold text-emerald-700">Confirmed Matches</p>
          <p className="text-2xl font-bold text-emerald-800 mt-1">{confirmedCount}</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-indigo-200 shadow-sm bg-indigo-50/30">
          <p className="text-xs font-semibold text-indigo-700">Manual Overrides</p>
          <p className="text-2xl font-bold text-indigo-800 mt-1">{overriddenCount}</p>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {[
              { key: "ALL", label: "All Matches" },
              { key: "REVIEW", label: `Review Required (${reviewCount})` },
              { key: "CONFIRMED", label: `Confirmed (${confirmedCount})` },
              { key: "OVERRIDDEN", label: `Overridden (${overriddenCount})` },
              { key: "REJECTED", label: "Rejected" },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setStatusFilter(tab.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${statusFilter === tab.key ? "bg-sky-600 text-white border-sky-600 shadow-sm" : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={15} />
            <input
              type="text"
              placeholder="Search flaw, weld, campaign..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
        </div>

        {/* Matches Table */}
        <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-96">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-100 text-slate-700 font-semibold sticky top-0 border-b border-slate-200">
              <tr>
                <th className="p-3">Observation</th>
                <th className="p-3">Matched Flaw Entity</th>
                <th className="p-3">Weld Joint</th>
                <th className="p-3">Circ Pos (mm)</th>
                <th className="p-3">Obs Length</th>
                <th className="p-3">Confidence Score</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredMatches.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400">
                    No indication matches found for the current filter.
                  </td>
                </tr>
              ) : (
                filteredMatches.map((m: any) => {
                  const scoreColor = m.confidenceScore >= 80 ? "text-emerald-700 bg-emerald-50 border-emerald-200" : m.confidenceScore >= 50 ? "text-amber-700 bg-amber-50 border-amber-200" : "text-red-700 bg-red-50 border-red-200";

                  return (
                    <tr key={m.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="p-3">
                        <span className="font-bold text-slate-800">Obs #{m.observationId}</span>
                        <p className="text-[10px] text-slate-500">{m.campaignName}</p>
                      </td>
                      <td className="p-3 font-bold text-sky-700">
                        {m.physicalIndicationCode}
                      </td>
                      <td className="p-3 font-semibold text-slate-700">{m.weldName}</td>
                      <td className="p-3">{m.circumferentialPosition} mm</td>
                      <td className="p-3 font-bold text-slate-900">{m.obsLength} mm</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full font-bold border text-[10px] ${scoreColor}`}>
                          {m.confidenceScore}% ({m.confidenceLevel})
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full font-semibold text-[10px] ${m.status === "CONFIRMED" ? "bg-emerald-100 text-emerald-800" : m.status === "OVERRIDDEN" ? "bg-indigo-100 text-indigo-800" : m.status === "REJECTED" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>
                          {m.status}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          {m.status !== "CONFIRMED" && (
                            <button
                              onClick={() => handleConfirm(m.id)}
                              disabled={actionLoading}
                              className="text-emerald-600 hover:text-emerald-800 p-1 hover:bg-emerald-50 rounded"
                              title="Confirm Match"
                            >
                              <CheckCircle2 size={16} />
                            </button>
                          )}
                          <button
                            onClick={() => handleOpenOverride(m)}
                            disabled={actionLoading}
                            className="text-indigo-600 hover:text-indigo-800 p-1 hover:bg-indigo-50 rounded"
                            title="Reassign / Override Target Flaw"
                          >
                            <Edit3 size={16} />
                          </button>
                          <button
                            onClick={() => handleOpenNewPi(m)}
                            disabled={actionLoading}
                            className="text-sky-600 hover:text-sky-800 p-1 hover:bg-sky-50 rounded"
                            title="Promote to New Independent Flaw Entity"
                          >
                            <PlusCircle size={16} />
                          </button>
                          {m.status !== "REJECTED" && (
                            <button
                              onClick={() => handleReject(m.id)}
                              disabled={actionLoading}
                              className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded"
                              title="Reject Match"
                            >
                              <XCircle size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* OVERRIDE / REASSIGN MODAL */}
      {overrideModalMatch && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl border border-slate-200 max-w-lg w-full p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Manual Match Override</h3>
                <p className="text-xs text-slate-500">Reassign observation to a different physical indication entity</p>
              </div>
              <button onClick={() => setOverrideModalMatch(null)} className="text-slate-400 hover:text-slate-600 text-sm font-bold">✕</button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-lg space-y-1">
                <p className="text-slate-500">Current Association:</p>
                <p className="font-bold text-slate-800">
                  Observation #{overrideModalMatch.observationId} ({overrideModalMatch.campaignName}) $\longrightarrow$ Currently linked to <span className="text-sky-700">{overrideModalMatch.physicalIndicationCode}</span>
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Target Physical Indication Entity:</label>
                <select
                  value={targetPiId}
                  onChange={(e) => setTargetPiId(Number(e.target.value))}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs focus:ring-1 focus:ring-sky-500 focus:outline-none font-semibold text-slate-800"
                >
                  {data?.pis.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.code} — Approx Loc: {p.approximateLocation}mm ({p.status})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Engineering Rationale (Audit Logged):</label>
                <textarea
                  rows={2}
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="e.g. Spatial proximity correction after B-scan review"
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs focus:ring-1 focus:ring-sky-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-2">
              <button
                onClick={() => setOverrideModalMatch(null)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={submitOverride}
                disabled={actionLoading}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors"
              >
                {actionLoading ? "Applying..." : "Confirm Override"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PROMOTE TO NEW PHYSICAL INDICATION MODAL */}
      {newPiModalMatch && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl border border-slate-200 max-w-lg w-full p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Promote to Standalone Flaw</h3>
                <p className="text-xs text-slate-500">Unlink from candidate and create a brand new physical flaw entity</p>
              </div>
              <button onClick={() => setNewPiModalMatch(null)} className="text-slate-400 hover:text-slate-600 text-sm font-bold">✕</button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">New Physical Indication Code:</label>
                <input
                  type="text"
                  value={newPiCode}
                  onChange={(e) => setNewPiCode(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs focus:ring-1 focus:ring-sky-500 focus:outline-none font-bold text-sky-800"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Engineering Justification:</label>
                <textarea
                  rows={2}
                  value={newPiReason}
                  onChange={(e) => setNewPiReason(e.target.value)}
                  placeholder="e.g. Separate crack tip identified in turnaround"
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs focus:ring-1 focus:ring-sky-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-2">
              <button
                onClick={() => setNewPiModalMatch(null)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={submitNewPi}
                disabled={actionLoading}
                className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-bold transition-colors"
              >
                {actionLoading ? "Creating..." : "Create & Link Flaw"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
