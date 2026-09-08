"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { getReportData, parseUploadedExcelReportData } from "./actions";
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
  ChevronDown,
  Upload,
  FileSpreadsheet,
  XCircle,
  Sparkles
} from "lucide-react";

export default function ReportsPage() {
  const [payload, setPayload] = useState<ReportPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedDrumId, setSelectedDrumId] = useState<number | null>(null);
  const [selectedWeldId, setSelectedWeldId] = useState<number | null>(null);
  const [selectedIndicationId, setSelectedIndicationId] = useState<number | null>(null);
  const [searchFilter, setSearchFilter] = useState<string>("");
  const [exportingDocx, setExportingDocx] = useState<boolean>(false);

  // User Configurable Job Parameters (Nominal Wall Thickness & Vessel Outer Diameter)
  const [customThicknessInput, setCustomThicknessInput] = useState<string>("");
  const [customDiameterInput, setCustomDiameterInput] = useState<string>("");

  // Uploaded Excel State
  const [uploadedExcelName, setUploadedExcelName] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadingExcel, setUploadingExcel] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  const loadReport = async (drumId?: number, weldId?: number, userThickness?: number, userDia?: number) => {
    setLoading(true);
    try {
      const data = await getReportData(drumId, weldId, userThickness, userDia);
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

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingExcel(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const parsedPayload = await parseUploadedExcelReportData(
        formData,
        undefined,
        undefined,
        customThicknessInput ? Number(customThicknessInput) : undefined,
        customDiameterInput ? Number(customDiameterInput) : undefined
      );
      setPayload(parsedPayload);
      setUploadedExcelName(file.name);
      setUploadedFile(file);
      setSelectedDrumId(parsedPayload.vesselInfo.id);
      setSelectedWeldId(parsedPayload.selectedWeldId);
      if (parsedPayload.indications.length > 0) {
        setSelectedIndicationId(parsedPayload.indications[0].id);
      }
    } catch (err: any) {
      console.error("Failed to parse uploaded Excel report:", err);
      alert(err.message || "Failed to parse Excel file. Please ensure it contains multi-campaign PAUT columns.");
    } finally {
      setUploadingExcel(false);
    }
  };

  const handleClearUploadedExcel = () => {
    setUploadedExcelName(null);
    setUploadedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    loadReport(
      undefined,
      undefined,
      customThicknessInput ? Number(customThicknessInput) : undefined,
      customDiameterInput ? Number(customDiameterInput) : undefined
    );
  };

  const handleDrumChange = async (id: number) => {
    setSelectedDrumId(id);
    setSelectedWeldId(null);

    if (uploadedFile && payload) {
      const drumObj = payload.availableDrums.find(d => d.id === id);
      if (drumObj) {
        setLoading(true);
        try {
          const formData = new FormData();
          formData.append("file", uploadedFile);
          const newPayload = await parseUploadedExcelReportData(
            formData, 
            drumObj.name, 
            undefined,
            customThicknessInput ? Number(customThicknessInput) : undefined,
            customDiameterInput ? Number(customDiameterInput) : undefined
          );
          setPayload(newPayload);
          setSelectedIndicationId(newPayload.indications[0]?.id ?? null);
        } catch (err) {
          console.error("Error switching drum on uploaded file:", err);
        } finally {
          setLoading(false);
        }
      }
    } else {
      loadReport(
        id, 
        undefined,
        customThicknessInput ? Number(customThicknessInput) : undefined,
        customDiameterInput ? Number(customDiameterInput) : undefined
      );
    }
  };

  const handleWeldChange = async (wId: number | null) => {
    setSelectedWeldId(wId);

    if (uploadedFile && payload) {
      const activeDrum = payload.availableDrums.find(d => d.id === selectedDrumId) || payload.availableDrums[0];
      const weldObj = wId ? payload.availableWelds.find(w => w.id === wId) : null;
      const targetWeldName = weldObj ? weldObj.name : "ALL";

      setLoading(true);
      try {
        const formData = new FormData();
        formData.append("file", uploadedFile);
        const newPayload = await parseUploadedExcelReportData(
          formData, 
          activeDrum?.name, 
          targetWeldName,
          customThicknessInput ? Number(customThicknessInput) : undefined,
          customDiameterInput ? Number(customDiameterInput) : undefined
        );
        setPayload(newPayload);
        setSelectedIndicationId(newPayload.indications[0]?.id ?? null);
      } catch (err) {
        console.error("Error switching weld on uploaded file:", err);
      } finally {
        setLoading(false);
      }
    } else {
      loadReport(
        selectedDrumId || undefined, 
        wId || undefined,
        customThicknessInput ? Number(customThicknessInput) : undefined,
        customDiameterInput ? Number(customDiameterInput) : undefined
      );
    }
  };

  // Helper to capture an SVG element as a high-resolution PNG data URL
  const captureSvgAsPng = async (containerId: string): Promise<string | undefined> => {
    try {
      const container = document.getElementById(containerId);
      if (!container) return undefined;
      const svg = container.querySelector("svg");
      if (!svg) return undefined;

      const svgData = new XMLSerializer().serializeToString(svg);
      const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
      const URL = window.URL || window.webkitURL || window;
      const blobURL = URL.createObjectURL(svgBlob);

      return await new Promise<string>((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
          const canvas = document.createElement("canvas");
          // 2x high-resolution rendering
          const scale = 2;
          canvas.width = (svg.clientWidth || 800) * scale;
          canvas.height = (svg.clientHeight || 400) * scale;

          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve("");
            return;
          }

          // Crisp white background for Word document
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

          URL.revokeObjectURL(blobURL);
          resolve(canvas.toDataURL("image/png"));
        };
        image.onerror = (e) => {
          URL.revokeObjectURL(blobURL);
          resolve("");
        };
        image.src = blobURL;
      });
    } catch (err) {
      console.warn(`Could not capture SVG for ${containerId}:`, err);
      return undefined;
    }
  };

  const handleExportDocx = async () => {
    if (!payload) return;
    setExportingDocx(true);
    try {
      // Capture live SVGs as crisp PNG images
      const [polarRingImg, weldPlanImg, bevelSScanImg, forecastCurveImg] = await Promise.all([
        captureSvgAsPng("report-polar-ring-container"),
        captureSvgAsPng("report-weld-plan-container"),
        captureSvgAsPng("report-bevel-sscan-container"),
        captureSvgAsPng("report-forecast-curve-container"),
      ]);

      const images = {
        polarRingImage: polarRingImg || undefined,
        weldPlanImage: weldPlanImg || undefined,
        bevelSScanImage: bevelSScanImg || undefined,
        forecastCurveImage: forecastCurveImg || undefined,
      };

      const activePayloadForDocx: ReportPayload = {
        ...payload,
        vesselInfo: {
          ...payload.vesselInfo,
          nominalThickness: effectiveNominalThickness,
          diameter: effectiveDiameter,
        },
        executiveSummary: effectiveExecutiveSummary || payload.executiveSummary,
        indications: displayIndications,
      };

      const res = await fetch("/api/reports/docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          drumId: selectedDrumId,
          weldId: selectedWeldId,
          customPayload: activePayloadForDocx,
          images,
        }),
      });

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

  const effectiveNominalThickness = customThicknessInput !== "" && !isNaN(Number(customThicknessInput)) && Number(customThicknessInput) > 0
    ? Number(customThicknessInput)
    : (payload?.vesselInfo.nominalThickness ?? 32.0);

  const effectiveDiameter = customDiameterInput !== "" && !isNaN(Number(customDiameterInput)) && Number(customDiameterInput) > 0
    ? Number(customDiameterInput)
    : (payload?.vesselInfo.diameter ?? 8.97);

  // Derived Vessel Dimensions
  const innerDiameterM = Number((effectiveDiameter - (2 * effectiveNominalThickness) / 1000).toFixed(3));
  const innerDiameterMm = Number((innerDiameterM * 1000).toFixed(0));
  const outerDiameterMm = Number((effectiveDiameter * 1000).toFixed(0));
  const circumferenceM = Number((effectiveDiameter * Math.PI).toFixed(2));
  const circumferenceMm = Math.round(circumferenceM * 1000);

  // Dynamic Indications reflecting live user-defined nominal wall thickness
  const displayIndications = useMemo<ReportIndicationItem[]>(() => {
    if (!payload) return [];
    return payload.indications.map((item) => {
      const depthPercentOfWall = Number(((item.currentDepth / effectiveNominalThickness) * 100).toFixed(1));
      let riskTier: "CRITICAL" | "HIGH" | "MODERATE" | "LOW" = "LOW";
      if (depthPercentOfWall >= 90) riskTier = "CRITICAL";
      else if (depthPercentOfWall >= 80) riskTier = "HIGH";
      else if (depthPercentOfWall >= 50) riskTier = "MODERATE";

      return {
        ...item,
        depthPercentOfWall,
        riskTier,
      };
    });
  }, [payload, effectiveNominalThickness]);

  const effectiveExecutiveSummary = useMemo(() => {
    if (!payload) return null;
    const criticalCount = displayIndications.filter((i) => i.riskTier === "CRITICAL").length;
    const highRiskCount = displayIndications.filter((i) => i.riskTier === "HIGH").length;
    return {
      ...payload.executiveSummary,
      criticalCount,
      highRiskCount,
    };
  }, [payload, displayIndications]);

  // Convert report items to TrackedPhysicalIndication for visualization components
  const trackedIndications = useMemo<TrackedPhysicalIndication[]>(() => {
    if (!payload) return [];
    return displayIndications.map((item) => {
      const campaignValues: Record<string, { 
        length: number | null; 
        depth: number | null;
        depthOd?: number | null;
        depthId?: number | null;
      }> = {};
      for (const h of item.campaignHistory) {
        campaignValues[h.campaignName] = { 
          length: h.length, 
          depth: h.depth,
          depthOd: h.depthOd ?? null,
          depthId: h.depthId ?? null,
        };
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
        latestDepthOd: item.currentDepthOd ?? null,
        latestDepthId: item.currentDepthId ?? null,
        cladStatus: item.cladStatus ?? 'INCLUDING',
        accumulatedHeight: item.accumulatedHeight ?? null,
        offsetMm: item.offsetMm ?? 0,
        toeType: item.toeType ?? 'CENTER',
        earliestLength: item.campaignHistory[0]?.length ?? item.currentLength,
        growthDelta: Number((item.currentLength - (item.campaignHistory[0]?.length ?? item.currentLength)).toFixed(1)),
        growthRateYear: item.growthRateYear,
        observationsCount: item.campaignHistory.length,
        campaignValues,
      };
    });
  }, [payload, displayIndications]);

  const selectedIndication = useMemo(() => {
    if (!payload) return null;
    return displayIndications.find((i) => i.id === selectedIndicationId) || displayIndications[0] || null;
  }, [payload, selectedIndicationId, displayIndications]);

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
    if (!searchFilter.trim()) return displayIndications;
    const q = searchFilter.toLowerCase();
    return displayIndications.filter(
      (i) =>
        i.code.toLowerCase().includes(q) ||
        i.weldName.toLowerCase().includes(q) ||
        i.riskTier.toLowerCase().includes(q) ||
        i.circumferentialPosition.toString().includes(q)
    );
  }, [payload, displayIndications, searchFilter]);

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

  const { vesselInfo, availableDrums, availableWelds } = payload;
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
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Direct Excel Upload Button */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleExcelUpload}
              className="hidden"
              id="report-excel-input"
            />

            {uploadedExcelName ? (
              <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-300 text-emerald-800 px-3 py-1.5 rounded-lg text-xs font-semibold">
                <FileSpreadsheet size={14} className="text-emerald-600" />
                <span className="truncate max-w-[140px] sm:max-w-[200px]" title={uploadedExcelName}>
                  {uploadedExcelName}
                </span>
                <button
                  onClick={handleClearUploadedExcel}
                  className="text-emerald-700 hover:text-red-600 transition ml-1 cursor-pointer"
                  title="Clear uploaded Excel and revert to database"
                >
                  <XCircle size={14} />
                </button>
              </div>
            ) : (
              <label
                htmlFor="report-excel-input"
                className={`flex items-center gap-1.5 px-3.5 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold shadow-2xs transition cursor-pointer ${
                  uploadingExcel ? "opacity-50 pointer-events-none" : ""
                }`}
              >
                {uploadingExcel ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-slate-600 border-t-transparent rounded-full animate-spin" />
                    Parsing Excel...
                  </>
                ) : (
                  <>
                    <Upload size={14} className="text-sky-600" /> Load Excel File (.xlsx)
                  </>
                )}
              </label>
            )}

            <button
              onClick={handleExportDocx}
              disabled={exportingDocx}
              className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-semibold shadow-xs transition disabled:opacity-50 cursor-pointer"
            >
              {exportingDocx ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Generating DOCX with High-Res Images...
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

        {/* Interactive Job Vessel Parameters (User Spec Entry) */}
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-sky-50/70 p-3 rounded-xl border border-sky-200">
          <div className="flex items-center gap-2">
            <Sliders size={15} className="text-sky-700" />
            <span className="font-bold text-slate-800 text-xs">Job Vessel Specifications (Editable):</span>
            <span className="text-[11px] text-slate-500 hidden sm:inline">Live recalculation of wall penetration &amp; S-Scan geometry</span>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <label className="font-semibold text-slate-700">Nominal Wall (t):</label>
              <div className="relative flex items-center">
                <input
                  type="number"
                  step="0.5"
                  min="1"
                  max="200"
                  value={customThicknessInput !== "" ? customThicknessInput : effectiveNominalThickness}
                  onChange={(e) => setCustomThicknessInput(e.target.value)}
                  className="w-20 px-2 py-1 border border-slate-300 rounded font-mono font-bold text-slate-900 bg-white focus:ring-2 focus:ring-sky-500 text-xs text-right pr-6"
                />
                <span className="absolute right-1.5 text-[11px] text-slate-400 font-semibold pointer-events-none">mm</span>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <label className="font-semibold text-slate-700">Outer Dia (OD):</label>
              <div className="relative flex items-center">
                <input
                  type="number"
                  step="0.01"
                  min="0.5"
                  max="50"
                  value={customDiameterInput !== "" ? customDiameterInput : effectiveDiameter}
                  onChange={(e) => setCustomDiameterInput(e.target.value)}
                  className="w-20 px-2 py-1 border border-slate-300 rounded font-mono font-bold text-slate-900 bg-white focus:ring-2 focus:ring-sky-500 text-xs text-right pr-5"
                />
                <span className="absolute right-1.5 text-[11px] text-slate-400 font-semibold pointer-events-none">m</span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded px-2.5 py-1 text-slate-700 shadow-2xs">
              <span className="text-slate-500 font-medium">Inner Dia (ID):</span>
              <span className="font-mono font-bold text-emerald-800">{innerDiameterM.toFixed(3)} m</span>
              <span className="text-[10px] text-slate-400 font-mono">({innerDiameterMm} mm)</span>
            </div>

            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded px-2.5 py-1 text-slate-700 shadow-2xs">
              <span className="text-slate-500 font-medium">Circumference:</span>
              <span className="font-mono font-bold text-sky-800">~{circumferenceM} m</span>
            </div>

            {(customThicknessInput !== "" || customDiameterInput !== "") && (
              <button
                type="button"
                onClick={() => {
                  setCustomThicknessInput("");
                  setCustomDiameterInput("");
                }}
                className="text-[11px] font-semibold text-sky-700 hover:text-sky-900 underline ml-1 cursor-pointer"
              >
                Reset Defaults
              </button>
            )}
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
                1. Executive Summary &amp; Vessel Specifications
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
                  {(effectiveExecutiveSummary || payload.executiveSummary).monitoredFlawsCount}
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
                <div className={`text-2xl font-black mt-1 ${(effectiveExecutiveSummary || payload.executiveSummary).criticalCount > 0 ? "text-red-600" : "text-emerald-700"}`}>
                  {(effectiveExecutiveSummary || payload.executiveSummary).criticalCount}
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
                  {(effectiveExecutiveSummary || payload.executiveSummary).earliestWarningDate || "None"}
                </div>
                <div className="text-[11px] text-amber-700 font-semibold mt-0.5">
                  {(effectiveExecutiveSummary || payload.executiveSummary).earliestWarningDays !== null ? `${(effectiveExecutiveSummary || payload.executiveSummary).earliestWarningDays} days remaining` : "Safe margin"}
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 shadow-2xs">
                <div className="flex items-center justify-between text-slate-500 text-xs">
                  <span>Recommended Outage</span>
                  <Calendar size={15} className="text-sky-600" />
                </div>
                <div className="text-sm font-bold text-sky-800 mt-1 truncate">
                  {(effectiveExecutiveSummary || payload.executiveSummary).recommendedTurnaroundDate || "Routine"}
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
                      <td className="p-2 font-bold text-slate-900">
                        {effectiveNominalThickness.toFixed(1)} mm
                        {customThicknessInput !== "" && (
                          <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-sky-100 text-sky-800">
                            Custom Spec
                          </span>
                        )}
                      </td>
                    </tr>
                    <tr className="border-b border-slate-100 bg-slate-50/70">
                      <td className="p-2 font-semibold text-slate-500">Outer Diameter (OD):</td>
                      <td className="p-2 font-bold text-slate-900">
                        {effectiveDiameter.toFixed(2)} m ({outerDiameterMm} mm)
                      </td>
                    </tr>
                    <tr className="border-b border-slate-100">
                      <td className="p-2 font-semibold text-slate-500">Inner Diameter (ID):</td>
                      <td className="p-2 font-bold text-emerald-800">
                        {innerDiameterM.toFixed(3)} m ({innerDiameterMm} mm)
                        <span className="text-[10px] text-slate-400 font-normal ml-1">(ID = OD - 2t)</span>
                      </td>
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
                    <tr className="border-b border-slate-100">
                      <td className="p-2 font-semibold text-slate-500">Circumference:</td>
                      <td className="p-2 font-bold text-slate-900">~{circumferenceM} m ({circumferenceMm} mm)</td>
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
              <span className="text-[11px] text-slate-500">North 0° • Anticlockwise Scan • Slots L1–L28 (~{circumferenceM} m Perimeter)</span>
            </div>

            <div id="report-polar-ring-container">
              <PolarCircumferentialRingMap
                indications={trackedIndications}
                selectedFlawCode={selectedIndication?.code}
                onSelectFlaw={(pi) => {
                  const found = displayIndications.find((i) => i.code === pi.code);
                  if (found) setSelectedIndicationId(found.id);
                }}
                drumName={vesselInfo.name}
                weldName={activeWeldName}
                totalCircumferenceMm={circumferenceMm}
                nominalWallThickness={effectiveNominalThickness}
              />
            </div>
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

            <div id="report-weld-plan-container">
              <WeldWidthPlanPlot
                indications={trackedIndications}
                selectedFlawCode={selectedIndication?.code}
                onSelectFlaw={(pi) => {
                  const found = displayIndications.find((i) => i.code === pi.code);
                  if (found) setSelectedIndicationId(found.id);
                }}
              />
            </div>
          </div>
        )}

        {/* Section 4: Flaw Growth Extrapolation & Lifing Curve */}
        {sections.predictiveForecast && selectedIndication && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-sky-600"></span>
                4. Predictive Growth Extrapolation &amp; Remaining Operating Life
              </h3>
              <span className="text-[11px] text-slate-500">
                Flaw {selectedIndication.code} | Rate: <strong>+{selectedIndication.growthRateYear} mm/yr</strong>
              </span>
            </div>

            <div id="report-forecast-curve-container" className="border border-slate-200 rounded-xl p-4 bg-white shadow-xs">
              <PredictiveForecastChart
                measurements={forecastMeasurements}
                flawCode={selectedIndication.code}
                locationInfo={`Weld Seam ${selectedIndication.weldName} (${selectedIndication.circumferentialPosition} mm)`}
                nominalThickness={effectiveNominalThickness}
              />
            </div>
          </div>
        )}

        {/* Section 5: Comprehensive Historical Defect Progression Table */}
        {sections.progressionTable && (
          <div className="space-y-3 pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-200 pb-1.5">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-sky-600"></span>
                5. Comprehensive Historical Defect Progression Table
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
                    <th className="p-2.5">#</th>
                    <th className="p-2.5">Flaw ID</th>
                    <th className="p-2.5">Weld</th>
                    <th className="p-2.5">Circ. Pos</th>
                    <th className="p-2.5">Length</th>
                    <th className="p-2.5">Depth</th>
                    <th className="p-2.5">Depth (ID / OD)</th>
                    <th className="p-2.5">% Wall</th>
                    <th className="p-2.5">Sound Wall</th>
                    <th className="p-2.5">Growth Rate</th>
                    <th className="p-2.5">80% Warning</th>
                    <th className="p-2.5">Days Rem.</th>
                    <th className="p-2.5 text-center">Risk Tier</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTableIndications.map((ind, idx) => {
                    const isSelected = ind.id === selectedIndicationId;
                    const tierBadgeColor =
                      ind.riskTier === "CRITICAL"
                        ? "bg-red-100 text-red-800 border-red-200"
                        : ind.riskTier === "HIGH"
                        ? "bg-amber-100 text-amber-800 border-amber-200"
                        : ind.riskTier === "MODERATE"
                        ? "bg-yellow-100 text-yellow-800 border-yellow-200"
                        : "bg-emerald-100 text-emerald-800 border-emerald-200";

                    const soundLigament = Math.max(
                      0,
                      effectiveNominalThickness -
                        ((ind.currentDepthId || 0) + (ind.currentDepthOd || 0) > 0
                          ? (ind.currentDepthId || 0) + (ind.currentDepthOd || 0)
                          : ind.currentDepth)
                    ).toFixed(1);

                    return (
                      <tr
                        key={ind.id}
                        onClick={() => setSelectedIndicationId(ind.id)}
                        className={`cursor-pointer transition hover:bg-sky-50/60 ${
                          isSelected ? "bg-sky-50 font-medium" : ""
                        }`}
                      >
                        <td className="p-2.5 font-bold text-sky-800">#{idx + 1}</td>
                        <td className="p-2.5 font-bold text-slate-900">{ind.code}</td>
                        <td className="p-2.5 text-slate-700">{ind.weldName}</td>
                        <td className="p-2.5 font-mono text-slate-700">{ind.circumferentialPosition} mm</td>
                        <td className="p-2.5 font-mono text-slate-800">{ind.currentLength} mm</td>
                        <td className="p-2.5 font-mono font-bold text-sky-800">{ind.currentDepth} mm</td>
                        <td className="p-2.5 font-mono text-[11px] text-slate-600">
                          {ind.currentDepthId !== null && ind.currentDepthId !== undefined ? `ID: ${ind.currentDepthId}mm` : ""}
                          {ind.currentDepthId && ind.currentDepthOd ? " • " : ""}
                          {ind.currentDepthOd !== null && ind.currentDepthOd !== undefined ? `OD: ${ind.currentDepthOd}mm` : ""}
                          {!ind.currentDepthId && !ind.currentDepthOd ? "—" : ""}
                        </td>
                        <td className="p-2.5 font-mono text-slate-700">{ind.depthPercentOfWall}%</td>
                        <td className="p-2.5 font-mono font-bold text-emerald-700">{soundLigament} mm</td>
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
                      <td colSpan={13} className="p-4 text-center text-slate-400 italic">
                        No indications matching filter criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-400 italic print:hidden">
              * Hover over any indication in the Weld Width Plan View or Polar Ring Map above to view its live through-thickness Double-V cross section.
            </p>
          </div>
        )}

        {/* Section 6: Engineering Recommendations & Turnaround Action Plan */}
        <div className="pt-4 border-t-2 border-slate-200 space-y-2 text-xs">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
            6. Turnaround Assessment Conclusions &amp; Action Plan
          </h3>
          <ul className="list-disc pl-5 space-y-1 text-slate-700 leading-relaxed">
            <li>
              <strong>Targeted Weld Seam Repairs:</strong> Prioritize remedial weld gouging and weld overlay on seams exhibiting accelerated growth prior to{" "}
              <strong>{(effectiveExecutiveSummary || payload.executiveSummary).recommendedTurnaroundDate || "the next planned outage"}</strong>.
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
