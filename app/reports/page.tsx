"use client";

import { useState, useEffect, useMemo } from "react";
import { getReportData } from "./actions";
import { ReportPayload, ReportIndicationItem, ReportSectionConfig } from "@/lib/reports/reportTypes";
import { TrackedPhysicalIndication } from "@/lib/import/matrixParser";
import { HistoricalMeasurement } from "@/lib/prediction/growthModel";
import { PolarCircumferentialRingMap } from "@/components/visualization/PolarCircumferentialRingMap";
import { WeldWidthPlanPlot } from "@/components/visualization/WeldWidthPlanPlot";
import { WeldBevelSScanProfile } from "@/components/visualization/WeldBevelSScanProfile";
import { PredictiveForecastChart } from "@/components/visualization/predictiveForecastChart";
import { 
  FileText, 
  Download, 
  Printer, 
  TrendingUp, 
  AlertTriangle, 
  ShieldAlert, 
  CheckCircle2, 
  Clock, 
  Calendar, 
  Layers, 
  Sliders, 
  Search,
  Filter,
  Info,
  ChevronDown
} from "lucide-react";

export default function ReportsPage() {
  const [payload, setPayload] = useState<ReportPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedDrumId, setSelectedDrumId] = useState<number | null>(null);
  const [selectedWeldId, setSelectedWeldId] = useState<number | null>(null);
  const [selectedIndicationId, setSelectedIndicationId] = useState<number | null>(null);
  const [searchFilter, setSearchFilter] = useState<string>("");
  const [exportingDocx, setExportingDocx] = useState<boolean>(false);

  // Section Visibility Toggles
  const [sections, setSections] = useState<ReportSectionConfig>({
    executiveSummary: true,
    polarRingMap: true,
    weldWidthPlan: true,
    bevelSScan: true,
    predictiveForecast: true,
    progressionTable: true,
  });

  useEffect(() => {
    loadReport();
  }, []);

  const loadReport = async (drumId?: number, weldId?: number) => {
    setLoading(true);
    try {
      const data = await getReportData(drumId, weldId);
      setPayload(data);
      setSelectedDrumId(data.vesselInfo.id);
      setSelectedWeldId(data.selectedWeldId);
      if (data.indications.length > 0) {
        setSelectedIndicationId(data.indications[0].id);
      }
    } catch (err) {
      console.error("Failed to load report data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDrumChange = (id: number) => {
    setSelectedDrumId(id);
    setSelectedWeldId(null);
    loadReport(id, undefined);
  };

  const handleWeldChange = (wId: number | null) => {
    setSelectedWeldId(wId);
    loadReport(selectedDrumId || undefined, wId || undefined);
  };

  const handleExportDocx = async () => {
    if (!payload) return;
    setExportingDocx(true);
    try {
      const params = new URLSearchParams();
      if (selectedDrumId) params.append("drumId", selectedDrumId.toString());
      if (selectedWeldId) params.append("weldId", selectedWeldId.toString());

      const res = await fetch(`/api/reports/docx?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to generate DOCX file");

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Coke_Drum_${payload.vesselInfo.name}_PAUT_Report.docx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error("DOCX download error:", err);
      alert("Could not generate Word document. Please try again.");
    } finally {
      setExportingDocx(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Convert report items to TrackedPhysicalIndication for visualization components
  const trackedIndications = useMemo<TrackedPhysicalIndication[]>(() => {
    if (!payload) return [];
    return payload.indications.map((item) => {
      const campaignValues: Record<string, { length: number | null; depth: number | null }> = {};
      for (const h of item.campaignHistory) {
        campaignValues[h.campaignName] = { length: h.length, depth: h.depth };
      }
      return {
        code: item.code,
        drumName: payload.vesselInfo.name,
        weldName: item.weldName,
        segment: item.segment || "0",
        locationText: `${item.circumferentialPosition} mm`,
        circumferentialPosition: item.circumferentialPosition,
        weldPosition: item.weldPosition || "Weld Seam",
        indicationType: "Crack-like flaw",
        hasRepairs: false,
        latestLength: item.currentLength,
        latestDepth: item.currentDepth,
        earliestLength: item.campaignHistory[0]?.length ?? item.currentLength,
        growthDelta: Number((item.currentLength - (item.campaignHistory[0]?.length ?? item.currentLength)).toFixed(1)),
        growthRateYear: item.growthRateYear,
        observationsCount: item.campaignHistory.length,
        campaignValues,
      };
    });
  }, [payload]);

  const selectedIndication = useMemo(() => {
    if (!payload) return null;
    return payload.indications.find((i) => i.id === selectedIndicationId) || payload.indications[0] || null;
  }, [payload, selectedIndicationId]);

  const selectedTrackedIndication = useMemo<TrackedPhysicalIndication | null>(() => {
    if (!selectedIndication || !payload) return null;
    return trackedIndications.find((t) => t.code === selectedIndication.code) || trackedIndications[0] || null;
  }, [selectedIndication, payload, trackedIndications]);

  const forecastMeasurements = useMemo<HistoricalMeasurement[]>(() => {
    if (!selectedIndication) return [];
    if (selectedIndication.campaignHistory.length > 0) {
      return selectedIndication.campaignHistory.map((h) => ({
        date: new Date(h.inspectionDate),
        campaignName: h.campaignName,
        depth: h.depth,
        length: h.length,
        circumferentialPosition: selectedIndication.circumferentialPosition,
      }));
    }
    return [
      {
        date: new Date(),
        campaignName: "Current",
        depth: selectedIndication.currentDepth,
        length: selectedIndication.currentLength,
        circumferentialPosition: selectedIndication.circumferentialPosition,
      },
    ];
  }, [selectedIndication]);

  const filteredTableIndications = useMemo(() => {
    if (!payload) return [];
    if (!searchFilter.trim()) return payload.indications;
    const q = searchFilter.toLowerCase();
    return payload.indications.filter(
      (i) =>
        i.code.toLowerCase().includes(q) ||
        i.weldName.toLowerCase().includes(q) ||
        i.riskTier.toLowerCase().includes(q) ||
        i.circumferentialPosition.toString().includes(q)
    );
  }, [payload, searchFilter]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] space-y-4">
        <div className="w-10 h-10 border-4 border-sky-200 border-t-sky-600 rounded-full animate-spin" />
        <p className="text-sm font-medium text-slate-600">Compiling Coke Drum Engineering Report...</p>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="p-8 text-center text-slate-500">
        <p>No report data found. Please ensure coke drums and inspection datasets are imported.</p>
      </div>
    );
  }

  const { vesselInfo, executiveSummary, availableDrums, availableWelds } = payload;
  const circumferenceM = Number((vesselInfo.diameter * Math.PI).toFixed(2));
  const activeWeldName = selectedWeldId 
    ? availableWelds.find(w => w.id === selectedWeldId)?.name || "Weld Seam" 
    : "All Weld Seams";

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6 text-slate-800">
      {/* Top Controls Bar (Hidden during print) */}
      <div className="print:hidden bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-sky-100 text-sky-800 text-[11px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                Phase 7 Module
              </span>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Turnaround & PAUT Engineering Reporting Suite
              </h1>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Comprehensive multi-view engineering inspection summary with automated DOCX export and print layouts
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={handleExportDocx}
              disabled={exportingDocx}
              className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-semibold shadow-xs transition disabled:opacity-50 cursor-pointer"
            >
              {exportingDocx ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Generating DOCX...
                </>
              ) : (
                <>
                  <Download size={14} /> Download DOCX Report
                </>
              )}
            </button>

            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition cursor-pointer"
            >
              <Printer size={14} /> Print / Save PDF
            </button>
          </div>
        </div>

        {/* Filters and Section Toggles */}
        <div className="pt-3 border-t border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
          {/* Drum & Weld Selectors */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-slate-700">Coke Drum:</span>
              <select
                value={selectedDrumId || ""}
                onChange={(e) => handleDrumChange(Number(e.target.value))}
                className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-sky-500 focus:outline-none"
              >
                {availableDrums.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-slate-700">Weld Seam:</span>
              <select
                value={selectedWeldId || ""}
                onChange={(e) => handleWeldChange(e.target.value ? Number(e.target.value) : null)}
                className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-sky-500 focus:outline-none"
              >
                <option value="">All Welds (Full Drum Overview)</option>
                {availableWelds.map((w) => (
                  <option key={w.id} value={w.id}>
                    Weld Joint {w.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Section Visibility Checkboxes */}
          <div className="flex flex-wrap items-center gap-4 text-slate-600">
            <span className="font-semibold text-slate-700">Sections:</span>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={sections.executiveSummary}
                onChange={(e) => setSections((s) => ({ ...s, executiveSummary: e.target.checked }))}
                className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              <span>Executive Summary</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={sections.polarRingMap}
                onChange={(e) => setSections((s) => ({ ...s, polarRingMap: e.target.checked }))}
                className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              <span>360° Ring</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={sections.weldWidthPlan}
                onChange={(e) => setSections((s) => ({ ...s, weldWidthPlan: e.target.checked }))}
                className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              <span>Weld Plan</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={sections.bevelSScan}
                onChange={(e) => setSections((s) => ({ ...s, bevelSScan: e.target.checked }))}
                className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              <span>Bevel S-Scan</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={sections.predictiveForecast}
                onChange={(e) => setSections((s) => ({ ...s, predictiveForecast: e.target.checked }))}
                className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              <span>Lifing Forecast</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={sections.progressionTable}
                onChange={(e) => setSections((s) => ({ ...s, progressionTable: e.target.checked }))}
                className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              <span>Data Table</span>
            </label>
          </div>
        </div>
      </div>

      {/* Printable Engineering Document Container */}
      <div className="bg-white border border-slate-300 rounded-xl shadow-md p-6 sm:p-10 space-y-8 print:border-none print:shadow-none print:p-0">
        
        {/* Document Header & Formal Title */}
        <div className="border-b-2 border-slate-800 pb-5 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-sky-700 text-white font-black text-lg flex items-center justify-center">
                CD
              </div>
              <div>
                <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
                  PAUT INSPECTION & REMAINING OPERATING LIFE REPORT
                </h2>
                <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold">
                  API 579-1 / ASME FFS-1 Fitness-For-Service Assessment
                </p>
              </div>
            </div>
            <div className="text-right text-xs">
              <p className="font-bold text-slate-900">DOC-REF: HAT-PAUT-{vesselInfo.name}-2026</p>
              <p className="text-slate-500">Date: {new Date().toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>
          </div>
        </div>

        {/* Section 1: Executive Summary & Vessel Geometry */}
        {sections.executiveSummary && (
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-sky-600"></span>
                1. Executive Summary & Vessel Specifications
              </h3>
              <span className="text-[11px] text-slate-500">Equipment: <strong>{vesselInfo.name}</strong> ({vesselInfo.clientName})</span>
            </div>

            {/* KPI Cards Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 shadow-2xs">
                <div className="flex items-center justify-between text-slate-500 text-xs">
                  <span>Monitored Flaws</span>
                  <Layers size={15} className="text-sky-600" />
                </div>
                <div className="text-2xl font-black text-slate-900 mt-1">
                  {executiveSummary.monitoredFlawsCount}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Tracked across all seams
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 shadow-2xs">
                <div className="flex items-center justify-between text-slate-500 text-xs">
                  <span>Critical Risk (&gt;90%)</span>
                  <AlertTriangle size={15} className="text-red-600" />
                </div>
                <div className={`text-2xl font-black mt-1 ${executiveSummary.criticalCount > 0 ? "text-red-600" : "text-emerald-700"}`}>
                  {executiveSummary.criticalCount}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Immediate outage attention
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 shadow-2xs">
                <div className="flex items-center justify-between text-slate-500 text-xs">
                  <span>Earliest 80% Warning</span>
                  <Clock size={15} className="text-amber-600" />
                </div>
                <div className="text-sm font-bold text-slate-900 mt-1 truncate">
                  {executiveSummary.earliestWarningDate || "None"}
                </div>
                <div className="text-[11px] text-amber-700 font-semibold mt-0.5">
                  {executiveSummary.earliestWarningDays !== null ? `${executiveSummary.earliestWarningDays} days remaining` : "Safe margin"}
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 shadow-2xs">
                <div className="flex items-center justify-between text-slate-500 text-xs">
                  <span>Recommended Outage</span>
                  <Calendar size={15} className="text-sky-600" />
                </div>
                <div className="text-sm font-bold text-sky-800 mt-1 truncate">
                  {executiveSummary.recommendedTurnaroundDate || "Routine"}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Turnaround Action Window
                </div>
              </div>
            </div>

            {/* Vessel Specs Table */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left">
                  <tbody>
                    <tr className="border-b border-slate-100 bg-slate-50/70">
                      <td className="p-2 font-semibold text-slate-500 w-1/2">Vessel Tag:</td>
                      <td className="p-2 font-bold text-slate-900">{vesselInfo.name}</td>
                    </tr>
                    <tr className="border-b border-slate-100">
                      <td className="p-2 font-semibold text-slate-500">Nominal Wall:</td>
                      <td className="p-2 font-bold text-slate-900">{vesselInfo.nominalThickness.toFixed(1)} mm</td>
                    </tr>
                    <tr className="border-b border-slate-100 bg-slate-50/70">
                      <td className="p-2 font-semibold text-slate-500">Outer Diameter:</td>
                      <td className="p-2 font-bold text-slate-900">{vesselInfo.diameter.toFixed(2)} m (~{circumferenceM} m circumference)</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left">
                  <tbody>
                    <tr className="border-b border-slate-100 bg-slate-50/70">
                      <td className="p-2 font-semibold text-slate-500 w-1/2">Shell Material:</td>
                      <td className="p-2 font-bold text-slate-900">{vesselInfo.material}</td>
                    </tr>
                    <tr className="border-b border-slate-100">
                      <td className="p-2 font-semibold text-slate-500">Cladding Layer:</td>
                      <td className="p-2 font-bold text-slate-900">Type 410S SS (~3.0 mm)</td>
                    </tr>
                    <tr className="border-b border-slate-100 bg-slate-50/70">
                      <td className="p-2 font-semibold text-slate-500">Assessment Scope:</td>
                      <td className="p-2 font-bold text-slate-900">{activeWeldName}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Section 2: 360° Circular Polar Ring Map */}
        {sections.polarRingMap && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-sky-600"></span>
                2. 360° Circumferential Polar Ring Map (Shell Cross-Section)
              </h3>
              <span className="text-[11px] text-slate-500">0 to 146 Segment Badges ({circumferenceM} m Perimeter)</span>
            </div>

            <PolarCircumferentialRingMap
              indications={trackedIndications}
              selectedFlawCode={selectedIndication?.code}
              onSelectFlaw={(pi) => {
                const found = payload.indications.find((i) => i.code === pi.code);
                if (found) setSelectedIndicationId(found.id);
              }}
              drumName={vesselInfo.name}
              weldName={activeWeldName}
              totalCircumferenceMm={Math.round(circumferenceM * 1000)}
            />
          </div>
        )}

        {/* Section 3: Weld Width Plan Projection */}
        {sections.weldWidthPlan && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-sky-600"></span>
                3. Weld Width with Indications Plan View (Index Offset vs ScanLength)
              </h3>
              <span className="text-[11px] text-slate-500">Top-Down C-Scan Projection relative to Centerline &amp; HAZ Limits</span>
            </div>

            <WeldWidthPlanPlot
              indications={trackedIndications}
              selectedFlawCode={selectedIndication?.code}
              onSelectFlaw={(pi) => {
                const found = payload.indications.find((i) => i.code === pi.code);
                if (found) setSelectedIndicationId(found.id);
              }}
            />
          </div>
        )}

        {/* Section 4: Bevel Ultrasonic S-Scan Cross-Section Profile */}
        {sections.bevelSScan && selectedTrackedIndication && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-sky-600"></span>
                4. Ultrasonic Bevel S-Scan Cross-Section Profile
              </h3>
              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-slate-500">Active Indication:</span>
                <select
                  value={selectedIndicationId || ""}
                  onChange={(e) => setSelectedIndicationId(Number(e.target.value))}
                  className="font-bold text-sky-800 bg-slate-50 border border-slate-300 rounded px-2 py-0.5"
                >
                  {payload.indications.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.code} ({i.currentLength} mm × {i.currentDepth} mm)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <WeldBevelSScanProfile
              indication={selectedTrackedIndication}
              nominalWallThickness={vesselInfo.nominalThickness}
            />
          </div>
        )}

        {/* Section 5: Flaw Growth Extrapolation & Lifing Curve */}
        {sections.predictiveForecast && selectedIndication && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-sky-600"></span>
                5. Predictive Growth Extrapolation &amp; Remaining Operating Life
              </h3>
              <span className="text-[11px] text-slate-500">
                Flaw {selectedIndication.code} | Rate: <strong>+{selectedIndication.growthRateYear} mm/yr</strong>
              </span>
            </div>

            <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-xs">
              <PredictiveForecastChart
                measurements={forecastMeasurements}
                flawCode={selectedIndication.code}
                locationInfo={`Weld Seam ${selectedIndication.weldName} (${selectedIndication.circumferentialPosition} mm)`}
                nominalThickness={vesselInfo.nominalThickness}
              />
            </div>
          </div>
        )}

        {/* Section 6: Comprehensive Historical Defect Progression Table */}
        {sections.progressionTable && (
          <div className="space-y-3 pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-200 pb-1.5">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-sky-600"></span>
                6. Comprehensive Historical Defect Progression Table
              </h3>

              {/* Quick Search */}
              <div className="print:hidden relative w-64">
                <Search size={13} className="absolute left-2.5 top-2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter flaw, weld, tier..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="w-full pl-8 pr-2.5 py-1 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500 bg-slate-50"
                />
              </div>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-x-auto shadow-2xs">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 font-bold">
                    <th className="p-2.5">Flaw ID</th>
                    <th className="p-2.5">Weld</th>
                    <th className="p-2.5">Circ. Pos</th>
                    <th className="p-2.5">Current Length</th>
                    <th className="p-2.5">Current Depth</th>
                    <th className="p-2.5">% Wall</th>
                    <th className="p-2.5">Growth Rate</th>
                    <th className="p-2.5">80% Warning</th>
                    <th className="p-2.5">Days Rem.</th>
                    <th className="p-2.5 text-center">Risk Tier</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTableIndications.map((ind) => {
                    const isSelected = ind.id === selectedIndicationId;
                    const tierBadgeColor =
                      ind.riskTier === "CRITICAL"
                        ? "bg-red-100 text-red-800 border-red-200"
                        : ind.riskTier === "HIGH"
                        ? "bg-amber-100 text-amber-800 border-amber-200"
                        : ind.riskTier === "MODERATE"
                        ? "bg-yellow-100 text-yellow-800 border-yellow-200"
                        : "bg-emerald-100 text-emerald-800 border-emerald-200";

                    return (
                      <tr
                        key={ind.id}
                        onClick={() => setSelectedIndicationId(ind.id)}
                        className={`cursor-pointer transition hover:bg-sky-50/60 ${
                          isSelected ? "bg-sky-50 font-medium" : ""
                        }`}
                      >
                        <td className="p-2.5 font-bold text-slate-900">{ind.code}</td>
                        <td className="p-2.5 text-slate-700">{ind.weldName}</td>
                        <td className="p-2.5 font-mono text-slate-700">{ind.circumferentialPosition} mm</td>
                        <td className="p-2.5 font-mono text-slate-800">{ind.currentLength} mm</td>
                        <td className="p-2.5 font-mono font-bold text-sky-800">{ind.currentDepth} mm</td>
                        <td className="p-2.5 font-mono text-slate-700">{ind.depthPercentOfWall}%</td>
                        <td className="p-2.5 font-mono font-bold text-amber-700">+{ind.growthRateYear} mm/yr</td>
                        <td className="p-2.5 text-slate-700">{ind.warningDate || "Safe"}</td>
                        <td className="p-2.5 font-mono">
                          {ind.warningDaysRemaining !== null ? (
                            <span className={ind.warningDaysRemaining <= 180 ? "text-red-600 font-bold" : "text-slate-700"}>
                              {ind.warningDaysRemaining} d
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="p-2.5 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${tierBadgeColor}`}>
                            {ind.riskTier}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredTableIndications.length === 0 && (
                    <tr>
                      <td colSpan={10} className="p-4 text-center text-slate-400 italic">
                        No indications matching filter criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-400 italic print:hidden">
              * Click any row in the table to synchronize and inspect its cross-sectional Bevel S-Scan and Predictive Growth Curve above.
            </p>
          </div>
        )}

        {/* Section 7: Engineering Recommendations & Turnaround Action Plan */}
        <div className="pt-4 border-t-2 border-slate-200 space-y-2 text-xs">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
            7. Turnaround Assessment Conclusions &amp; Action Plan
          </h3>
          <ul className="list-disc pl-5 space-y-1 text-slate-700 leading-relaxed">
            <li>
              <strong>Targeted Weld Seam Repairs:</strong> Prioritize remedial weld gouging and weld overlay on seams exhibiting accelerated growth prior to{" "}
              <strong>{executiveSummary.recommendedTurnaroundDate || "the next planned outage"}</strong>.
            </li>
            <li>
              <strong>API 579 FFS Monitoring:</strong> Maintain rigorous annual ultrasonic phased array surveillance on all indications within the High and Critical risk tiers.
            </li>
            <li>
              <strong>Quench Cycle Management:</strong> Correlate thermal transients and water quench fill rates with circumferential crack propagation at bottom cone and shell courses.
            </li>
          </ul>

          <div className="pt-6 flex items-center justify-between text-slate-400 text-[11px] border-t border-slate-100">
            <span>Coke Drum HAT Platform | Lead Inspection Engineer Sign-off</span>
            <span>Verified against PAUT Master Database</span>
          </div>
        </div>

      </div>
    </div>
  );
}
