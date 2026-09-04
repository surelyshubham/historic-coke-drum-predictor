"use client";

import { useState, useEffect } from "react";
import { getAnalysisDrums, getHistoricalAnalysisData } from "./actions";
import { PhysicalIndicationHistory } from "@/lib/analytics/growthCalculator";
import { Activity, Calendar, Filter, TrendingUp, AlertTriangle, Layers, ChevronRight, Info } from "lucide-react";

export default function HistoricalAnalysisPage() {
  const [drums, setDrums] = useState<any[]>([]);
  const [selectedDrumId, setSelectedDrumId] = useState<number | "">("");
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Inspection Selection State (Multi-inspection comparison)
  const [selectedInspectionIds, setSelectedInspectionIds] = useState<number[]>([]);
  const [comparisonLimit, setComparisonLimit] = useState(10);

  // Filter States
  const [weldFilter, setWeldFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [minGrowthFilter, setMinGrowthFilter] = useState<number>(0);
  const [selectedIndication, setSelectedIndication] = useState<PhysicalIndicationHistory | null>(null);

  useEffect(() => {
    getAnalysisDrums().then((res) => {
      setDrums(res);
      if (res.length > 0) {
        setSelectedDrumId(res[0].id);
        loadDrumData(res[0].id);
      }
    });
  }, []);

  const loadDrumData = async (drumId: number) => {
    setLoading(true);
    try {
      const data = await getHistoricalAnalysisData(drumId);
      setAnalysisData(data);
      setSelectedInspectionIds(data.inspections.map((i: any) => i.id).slice(-comparisonLimit));
    } catch (err) {
      console.error("Failed to load analysis data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDrumChange = (id: number) => {
    setSelectedDrumId(id);
    loadDrumData(id);
  };

  const toggleInspectionSelection = (id: number) => {
    if (selectedInspectionIds.includes(id)) {
      setSelectedInspectionIds(selectedInspectionIds.filter(i => i !== id));
    } else {
      if (selectedInspectionIds.length >= comparisonLimit) {
        alert(`Maximum ${comparisonLimit} inspection campaigns can be compared simultaneously.`);
        return;
      }
      setSelectedInspectionIds([...selectedInspectionIds, id]);
    }
  };

  // Filter physical indications based on user controls
  const filteredHistories = (analysisData?.physicalHistories || []).filter((h: PhysicalIndicationHistory) => {
    if (weldFilter !== "ALL" && h.weldName !== weldFilter) return false;
    if (statusFilter !== "ALL" && h.status !== statusFilter) return false;
    if (minGrowthFilter > 0) {
      const rate = h.growth?.lengthGrowthRatePerYear || 0;
      if (rate < minGrowthFilter) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Historical PAUT Analysis & Indication Tracking</h2>
          <p className="text-sm text-slate-500">Track physical flaw progression, growth rates, and compare multi-campaign inspection datasets.</p>
        </div>

        <div className="flex items-center space-x-3">
          <label className="text-xs font-semibold text-slate-600">Select Drum:</label>
          <select
            value={selectedDrumId}
            onChange={(e) => handleDrumChange(Number(e.target.value))}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-sky-800 bg-sky-50/50 focus:ring-1 focus:ring-sky-500 focus:outline-none"
          >
            {drums.map((d) => (
              <option key={d.id} value={d.id}>{d.name} — {d.description || "Coke Drum"}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Engineering Distinction Alert Notice */}
      <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-5 text-sky-950 flex items-start space-x-4">
        <Info className="text-sky-600 shrink-0 mt-0.5" size={20} />
        <div className="text-xs leading-relaxed">
          <strong className="font-semibold text-sky-900">Important Engineering Distinction:</strong>
          <p className="mt-0.5 text-sky-800">
            Aggregate inspection totals (e.g. 181 observations, 155.3m total recorded length) represent total recorded indications per campaign. They do <strong>NOT</strong> equal physical flaw growth. True physical flaw growth is computed strictly between matched persistent entities (e.g. <code>PI-000001</code>).
          </p>
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-400">Loading historical inspection datasets...</div>
      ) : analysisData && (
        <>
          {/* Timeline & Campaign Selector Bar */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 flex items-center space-x-2">
                <Calendar size={18} className="text-sky-600" />
                <span>Inspection Campaigns Timeline</span>
              </h3>
              <div className="flex items-center space-x-2 text-xs text-slate-500">
                <span>Comparison Limit:</span>
                <select 
                  value={comparisonLimit}
                  onChange={(e) => setComparisonLimit(Number(e.target.value))}
                  className="border rounded px-2 py-0.5 text-slate-700 bg-slate-50"
                >
                  <option value={5}>Last 5</option>
                  <option value={10}>Last 10 (Default)</option>
                  <option value={20}>Last 20</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              {analysisData.inspections.map((insp: any) => {
                const selected = selectedInspectionIds.includes(insp.id);
                return (
                  <button
                    key={insp.id}
                    onClick={() => toggleInspectionSelection(insp.id)}
                    className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${selected ? "bg-sky-600 text-white border-sky-600 shadow-sm" : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"}`}
                  >
                    <span>{insp.campaignName}</span>
                    <span className="text-[10px] opacity-80">({new Date(insp.inspectionDate).toLocaleDateString()})</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Aggregate Inspection Statistics Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {analysisData.aggregateStats.map((stat: any) => (
              <div key={stat.inspectionId} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-sky-700">{stat.campaignName}</span>
                  <span className="text-xs text-slate-400">{new Date(stat.inspectionDate).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between items-baseline pt-2">
                  <div>
                    <p className="text-2xl font-bold text-slate-900">{stat.recordedCount}</p>
                    <p className="text-xs text-slate-500">Recorded Observations</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-sky-600">{stat.recordedLength} <span className="text-xs text-slate-500 font-normal">mm</span></p>
                    <p className="text-xs text-slate-500">Aggregate Defect Length</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Filters & Physical Indications Comparison Table */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                <TrendingUp size={18} className="text-sky-600" />
                <span>Matched Physical Indication Growth Tracking</span>
              </h3>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center space-x-1.5 text-xs text-slate-600">
                  <Filter size={14} />
                  <span>Weld:</span>
                  <select value={weldFilter} onChange={(e) => setWeldFilter(e.target.value)} className="border border-slate-300 rounded px-2 py-1 bg-white text-xs">
                    <option value="ALL">All Welds</option>
                    {analysisData.welds.map((w: any) => (
                      <option key={w.id} value={w.name}>{w.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center space-x-1.5 text-xs text-slate-600">
                  <span>Status:</span>
                  <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border border-slate-300 rounded px-2 py-1 bg-white text-xs">
                    <option value="ALL">All Statuses</option>
                    <option value="ACTIVE">Active Flaws</option>
                    <option value="REPAIRED">Repaired</option>
                  </select>
                </div>

                <div className="flex items-center space-x-1.5 text-xs text-slate-600">
                  <span>Min Growth:</span>
                  <select value={minGrowthFilter} onChange={(e) => setMinGrowthFilter(Number(e.target.value))} className="border border-slate-300 rounded px-2 py-1 bg-white text-xs">
                    <option value={0}>Any Growth</option>
                    <option value={1}>&gt;= 1.0 mm/yr</option>
                    <option value={3}>&gt;= 3.0 mm/yr</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Historical Comparison Table */}
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="p-3">Physical Indication</th>
                    <th className="p-3">Weld Joint</th>
                    <th className="p-3">Circumferential Pos</th>
                    <th className="p-3">Latest Length</th>
                    <th className="p-3">Latest Depth</th>
                    <th className="p-3">Observed Growth</th>
                    <th className="p-3">Growth Rate</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistories.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-6 text-center text-slate-400">No physical indications match the selected filters.</td>
                    </tr>
                  ) : (
                    filteredHistories.map((h: PhysicalIndicationHistory) => {
                      const latestObs = h.observations[h.observations.length - 1];
                      const growth = h.growth;
                      return (
                        <tr key={h.physicalIndicationId} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                          <td className="p-3 font-bold text-sky-700">{h.code}</td>
                          <td className="p-3 font-semibold text-slate-700">{h.weldName}</td>
                          <td className="p-3">{latestObs?.circumferentialPosition} mm</td>
                          <td className="p-3 font-bold text-slate-900">{latestObs?.length} mm</td>
                          <td className="p-3 font-bold text-slate-900">{latestObs?.depth} mm</td>
                          <td className="p-3 font-medium">
                            {growth ? (
                              <span className={growth.lengthDelta > 0 ? "text-amber-600" : "text-emerald-600"}>
                                {growth.lengthDelta > 0 ? `+${growth.lengthDelta} mm` : `${growth.lengthDelta} mm`} ({growth.lengthPercentChange > 0 ? `+${growth.lengthPercentChange.toFixed(1)}%` : `${growth.lengthPercentChange.toFixed(1)}%`})
                              </span>
                            ) : (
                              <span className="text-slate-400">Baseline</span>
                            )}
                          </td>
                          <td className="p-3">
                            {growth ? (
                              <span className="px-2 py-0.5 rounded-full font-bold bg-amber-100 text-amber-800">
                                {growth.lengthGrowthRatePerYear > 0 ? `+${growth.lengthGrowthRatePerYear.toFixed(1)} mm/yr` : `${growth.lengthGrowthRatePerYear.toFixed(1)} mm/yr`}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded-full font-semibold text-[10px] ${h.status === "ACTIVE" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>
                              {h.status}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <button
                              onClick={() => setSelectedIndication(h)}
                              className="text-sky-600 hover:text-sky-800 font-semibold hover:underline flex items-center space-x-1 ml-auto"
                            >
                              <span>Timeline</span>
                              <ChevronRight size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Physical Indication Timeline Drawer / Detail Modal */}
          {selectedIndication && (
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-xl border border-slate-200 max-w-2xl w-full p-6 shadow-xl space-y-6">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Indication History: {selectedIndication.code}</h3>
                    <p className="text-xs text-slate-500">Weld Joint: {selectedIndication.weldName} | Status: {selectedIndication.status}</p>
                  </div>
                  <button onClick={() => setSelectedIndication(null)} className="text-slate-400 hover:text-slate-600 text-sm font-bold">✕</button>
                </div>

                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider">Campaign Observations Progression</h4>
                  <div className="space-y-3">
                    {selectedIndication.observations.map((obs, idx) => (
                      <div key={obs.observationId} className="flex items-center justify-between p-4 rounded-lg border border-slate-200 bg-slate-50/60">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 rounded-full bg-sky-100 text-sky-700 font-bold flex items-center justify-center text-xs">
                            {idx + 1}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-800">{obs.campaignName}</p>
                            <p className="text-xs text-slate-500">{new Date(obs.inspectionDate).toLocaleDateString()}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-slate-900">Length: {obs.length} mm | Depth: {obs.depth} mm</p>
                          <p className="text-xs text-slate-500">Circumferential: {obs.circumferentialPosition} mm</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {selectedIndication.growth && (
                    <div className="p-4 rounded-lg bg-sky-50 border border-sky-200 space-y-1">
                      <p className="text-xs font-bold text-sky-900">Growth Rate Calculation:</p>
                      <p className="text-xs text-sky-800">
                        Length Delta: <strong>+{selectedIndication.growth.lengthDelta} mm</strong> | Time Interval: <strong>{selectedIndication.growth.yearsInterval.toFixed(2)} years</strong>
                      </p>
                      <p className="text-xs text-sky-800 font-semibold">
                        Annual Growth Rate: +{selectedIndication.growth.lengthGrowthRatePerYear.toFixed(2)} mm/year
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex justify-end">
                  <button onClick={() => setSelectedIndication(null)} className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-semibold">
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
