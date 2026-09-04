"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { getPredictionOverview, calculateIndicationProjection, IndicationOverviewItem, PredictionOverviewResponse } from "./actions";
import { PredictionModelType, ScenarioType, PredictionResult } from "@/lib/prediction/growthModel";
import { 
  TrendingUp, 
  AlertTriangle, 
  ShieldAlert, 
  Calendar, 
  Clock, 
  Activity, 
  Settings2, 
  RotateCcw, 
  Sliders, 
  Layers, 
  CheckCircle2, 
  ArrowUpRight,
  HelpCircle
} from "lucide-react";

export default function PredictiveModelingPage() {
  const [overview, setOverview] = useState<PredictionOverviewResponse | null>(null);
  const [selectedDrumId, setSelectedDrumId] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedIndicationId, setSelectedIndicationId] = useState<number | null>(null);

  // Model & Scenario Controls
  const [modelType, setModelType] = useState<PredictionModelType>("LINEAR");
  const [scenario, setScenario] = useState<ScenarioType>("MODERATE");
  const [displayMetric, setDisplayMetric] = useState<"DEPTH" | "LENGTH">("DEPTH");

  // Custom User Color Codes & Configurable Thresholds (Beside the Graph)
  const [nominalWallThickness, setNominalWallThickness] = useState<number>(32.0);
  const [warningPercent, setWarningPercent] = useState<number>(80);
  const [criticalPercent, setCriticalPercent] = useState<number>(100);
  const [warningColor, setWarningColor] = useState<string>("#f59e0b"); // Amber
  const [criticalColor, setCriticalColor] = useState<string>("#ef4444"); // Red
  const [curveColor, setCurveColor] = useState<string>("#0284c7"); // Sky blue
  const [confidenceColor, setConfidenceColor] = useState<string>("#38bdf8"); // Light sky

  // Projection Result for Currently Inspected Indication
  const [projection, setProjection] = useState<PredictionResult | null>(null);
  const [projectionLoading, setProjectionLoading] = useState<boolean>(false);

  // Floating Cursor & Tooltip State
  const [hoverData, setHoverData] = useState<{
    x: number;
    y: number;
    point: any;
  } | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);

  // Initial Load
  useEffect(() => {
    loadOverview();
  }, []);

  const loadOverview = async (drumId?: number) => {
    setLoading(true);
    try {
      const res = await getPredictionOverview(drumId);
      setOverview(res);
      setSelectedDrumId(res.selectedDrum.id);
      setNominalWallThickness(res.selectedDrum.nominalThickness || 32.0);

      if (res.indications.length > 0) {
        setSelectedIndicationId(res.indications[0].id);
      }
    } catch (err) {
      console.error("Failed to load prediction overview:", err);
    } finally {
      setLoading(false);
    }
  };

  // Re-fetch or re-calculate projection when indication, model, scenario, or thresholds change
  useEffect(() => {
    if (!selectedIndicationId) return;

    let isMounted = true;
    setProjectionLoading(true);

    calculateIndicationProjection(selectedIndicationId, {
      modelType,
      scenario,
      thresholds: {
        nominalWallThickness,
        warningThresholdPercent: warningPercent,
        criticalThresholdPercent: criticalPercent,
        criticalLengthLimit: 500.0,
      },
    })
      .then((res) => {
        if (isMounted) setProjection(res);
      })
      .catch((err) => console.error("Failed calculating projection:", err))
      .finally(() => {
        if (isMounted) setProjectionLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedIndicationId, modelType, scenario, nominalWallThickness, warningPercent, criticalPercent]);

  const selectedIndication = useMemo(() => {
    return overview?.indications.find((i) => i.id === selectedIndicationId) || null;
  }, [overview, selectedIndicationId]);

  // Derived threshold values in mm
  const warningDepthMm = (nominalWallThickness * warningPercent) / 100.0;
  const criticalDepthMm = (nominalWallThickness * criticalPercent) / 100.0;

  // SVG Chart Geometry & Scaling
  const chartConfig = useMemo(() => {
    const width = 840;
    const height = 380;
    const margin = { top: 35, right: 40, bottom: 45, left: 65 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const fallbackScaleX = (_: number) => margin.left;
    const fallbackScaleY = (_: number) => margin.top + innerHeight;

    if (!projection || projection.timeSeries.length === 0) {
      return {
        width,
        height,
        margin,
        innerWidth,
        innerHeight,
        hasData: false,
        minTime: 0,
        maxTime: 1,
        maxY: 40,
        scaleX: fallbackScaleX,
        scaleY: fallbackScaleY,
      };
    }

    const series = projection.timeSeries;
    const minTime = series[0].timestamp;
    const maxTime = series[series.length - 1].timestamp;
    const timeSpan = maxTime - minTime || 1;

    let maxY = criticalDepthMm * 1.15;
    if (displayMetric === "DEPTH") {
      const maxUpper = Math.max(...series.map((p) => p.depthUpper));
      maxY = Math.max(maxY, maxUpper * 1.1, criticalDepthMm + 4);
    } else {
      const maxLen = Math.max(...series.map((p) => p.lengthUpper));
      maxY = Math.max(100, maxLen * 1.15);
    }

    const scaleX = (timestamp: number) => {
      return margin.left + ((timestamp - minTime) / timeSpan) * innerWidth;
    };

    const scaleY = (val: number) => {
      const ratio = Math.max(0, val) / maxY;
      return margin.top + innerHeight - ratio * innerHeight;
    };

    return {
      width,
      height,
      margin,
      innerWidth,
      innerHeight,
      hasData: true,
      minTime,
      maxTime,
      maxY,
      scaleX,
      scaleY,
    };
  }, [projection, criticalDepthMm, displayMetric]);

  // Floating Cursor Handler
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!chartConfig.hasData || !projection || !svgRef.current) return;

    const svgRect = svgRef.current.getBoundingClientRect();
    const mouseX = e.clientX - svgRect.left;
    const mouseY = e.clientY - svgRect.top;

    // Boundary check
    if (
      mouseX < chartConfig.margin.left ||
      mouseX > chartConfig.width - chartConfig.margin.right ||
      mouseY < chartConfig.margin.top ||
      mouseY > chartConfig.height - chartConfig.margin.bottom
    ) {
      setHoverData(null);
      return;
    }

    // Find closest point along time dimension
    let closestPoint: any = null;
    let minDistance = Infinity;

    for (const pt of projection.timeSeries) {
      const ptX = chartConfig.scaleX(pt.timestamp);
      const dist = Math.abs(ptX - mouseX);
      if (dist < minDistance) {
        minDistance = dist;
        closestPoint = pt;
      }
    }

    if (closestPoint) {
      setHoverData({
        x: chartConfig.scaleX(closestPoint.timestamp),
        y: chartConfig.scaleY(displayMetric === "DEPTH" ? closestPoint.depth : closestPoint.length),
        point: closestPoint,
      });
    }
  };

  const handleMouseLeave = () => {
    setHoverData(null);
  };

  const resetThresholds = () => {
    setWarningPercent(80);
    setCriticalPercent(100);
    setWarningColor("#f59e0b");
    setCriticalColor("#ef4444");
    setCurveColor("#0284c7");
    setConfidenceColor("#38bdf8");
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-sky-600 border-t-transparent mx-auto mb-3"></div>
          <p className="text-sm font-medium text-slate-600">Loading Predictive Engineering Models...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-16">
      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-sky-100 text-sky-800 text-xs font-semibold px-2.5 py-0.5 rounded-full">Phase 6 Engine</span>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Growth & Predictive Modeling</h1>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Deterministic OLS & Exponential engineering extrapolation with user-configured wall loss thresholds
            </p>
          </div>

          {/* Drum Selector */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Coke Drum:</span>
            <select
              value={selectedDrumId || ""}
              onChange={(e) => {
                const id = Number(e.target.value);
                setSelectedDrumId(id);
                loadOverview(id);
              }}
              className="bg-white border border-slate-300 text-slate-800 text-sm font-semibold rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-sky-500 focus:outline-none shadow-xs"
            >
              {overview?.availableDrums.map((d) => (
                <option key={d.id} value={d.id}>
                  Drum {d.name}
                </option>
              ))}
            </select>
            <div className="hidden lg:flex items-center text-xs bg-sky-50 text-sky-700 px-3 py-1.5 rounded-lg border border-sky-200">
              <span className="font-semibold mr-1">Nominal Wall:</span> {nominalWallThickness.toFixed(1)} mm
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 mt-6 space-y-6">
        {/* Top Summary KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Monitored Flaws</span>
              <Activity size={16} className="text-sky-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-2">{overview?.summary.totalFlawsMonitored || 0}</div>
            <div className="text-xs text-slate-400 mt-1">Across all welded seams</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-red-200 shadow-xs bg-red-50/20">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-red-700">Critical Priority</span>
              <ShieldAlert size={16} className="text-red-600" />
            </div>
            <div className="text-2xl font-bold text-red-600 mt-2">{overview?.summary.criticalCount || 0}</div>
            <div className="text-xs text-red-500 mt-1">Exceeding warning threshold</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-xs bg-amber-50/20">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-amber-700">Earliest Warning ({warningPercent}%)</span>
              <AlertTriangle size={16} className="text-amber-500" />
            </div>
            <div className="text-lg font-bold text-slate-900 mt-2">
              {overview?.summary.earliestWarningDate || "None in 5 yrs"}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              At {warningDepthMm.toFixed(1)} mm depth limit
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Through-Wall Limit ({criticalPercent}%)</span>
              <Clock size={16} className="text-slate-600" />
            </div>
            <div className="text-lg font-bold text-slate-900 mt-2">
              {overview?.summary.earliestThroughWallDate || "None in 5 yrs"}
            </div>
            <div className="text-xs text-slate-500 mt-1">At {criticalDepthMm.toFixed(1)} mm full wall</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-sky-200 shadow-xs bg-sky-50/30">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-sky-800">Next Turnaround</span>
              <Calendar size={16} className="text-sky-600" />
            </div>
            <div className="text-lg font-bold text-sky-900 mt-2">
              {overview?.summary.recommendedTurnaroundDate || "2027-10-01"}
            </div>
            <div className="text-xs text-sky-600 mt-1">6 mos before warning breach</div>
          </div>
        </div>

        {/* Main Forecasting Area: Chart (Left) + Custom Colors & Thresholds Panel (Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Left Column: Interactive Predictive Forecast Chart */}
          <div className="lg:col-span-8 bg-white p-6 rounded-xl border border-slate-200 shadow-xs">
            {/* Chart Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 text-base">
                  Flaw: {selectedIndication?.code || "PI-000001"}
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                  {selectedIndication?.weldName} @ {Math.round(selectedIndication?.circumferentialPosition || 0)}mm
                </span>
                {projectionLoading && (
                  <span className="text-xs text-sky-600 animate-pulse font-medium">Computing...</span>
                )}
              </div>

              {/* Toggles: Model, Scenario, Metric */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Metric Selector */}
                <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                  <button
                    onClick={() => setDisplayMetric("DEPTH")}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${
                      displayMetric === "DEPTH" ? "bg-white text-sky-700 shadow-xs" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Depth (mm)
                  </button>
                  <button
                    onClick={() => setDisplayMetric("LENGTH")}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${
                      displayMetric === "LENGTH" ? "bg-white text-sky-700 shadow-xs" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Length (mm)
                  </button>
                </div>

                {/* Model Selector */}
                <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                  <button
                    onClick={() => setModelType("LINEAR")}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${
                      modelType === "LINEAR" ? "bg-white text-sky-700 shadow-xs" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Linear OLS
                  </button>
                  <button
                    onClick={() => setModelType("EXPONENTIAL")}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${
                      modelType === "EXPONENTIAL" ? "bg-white text-sky-700 shadow-xs" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Exponential
                  </button>
                </div>

                {/* Scenario Selector */}
                <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                  <button
                    onClick={() => setScenario("CONSERVATIVE")}
                    className={`px-2 py-1 text-xs font-medium rounded-md transition ${
                      scenario === "CONSERVATIVE" ? "bg-red-50 text-red-700 font-semibold" : "text-slate-600"
                    }`}
                  >
                    Conservative
                  </button>
                  <button
                    onClick={() => setScenario("MODERATE")}
                    className={`px-2 py-1 text-xs font-medium rounded-md transition ${
                      scenario === "MODERATE" ? "bg-white text-sky-700 shadow-xs font-semibold" : "text-slate-600"
                    }`}
                  >
                    Moderate
                  </button>
                  <button
                    onClick={() => setScenario("OPTIMISTIC")}
                    className={`px-2 py-1 text-xs font-medium rounded-md transition ${
                      scenario === "OPTIMISTIC" ? "bg-emerald-50 text-emerald-700 font-semibold" : "text-slate-600"
                    }`}
                  >
                    Optimistic
                  </button>
                </div>
              </div>
            </div>

            {/* Live Readout HUD Ribbon (Always unobscured above the forecast chart) */}
            <div className="mt-3 flex items-center justify-between bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-xs">
              {hoverData ? (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400 font-medium">Date:</span>
                    <span className="font-mono font-bold text-slate-900">{hoverData.point.date}</span>
                    <span className={`px-1.5 py-0.2 rounded text-[10px] font-semibold ${hoverData.point.isHistorical ? "bg-sky-100 text-sky-800" : "bg-purple-100 text-purple-800"}`}>
                      {hoverData.point.isHistorical ? hoverData.point.campaignName || "Measured" : "Projected"}
                    </span>
                  </div>
                  <span className="text-slate-300">|</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400 font-medium">Depth:</span>
                    <span className="font-mono font-bold text-sky-800">{hoverData.point.depth.toFixed(2)} mm</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-sky-100 text-sky-800 font-semibold">
                      {((hoverData.point.depth / nominalWallThickness) * 100).toFixed(1)}% of Wall
                    </span>
                  </div>
                  <span className="text-slate-300">|</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400 font-medium">Length:</span>
                    <span className="font-mono font-bold text-slate-800">{hoverData.point.length.toFixed(1)} mm</span>
                  </div>
                  <span className="text-slate-300">|</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400 font-medium">Warning Margin:</span>
                    <span className={`font-mono font-bold ${hoverData.point.depth >= warningDepthMm ? "text-amber-600" : "text-emerald-700"}`}>
                      {hoverData.point.depth >= warningDepthMm ? "BREACHED" : `+${(warningDepthMm - hoverData.point.depth).toFixed(1)} mm`}
                    </span>
                  </div>
                </div>
              ) : (
                <span className="text-slate-400 italic text-[11px] flex items-center gap-1.5">
                  <span>🎯 Move cursor across timeline to inspect measured points, forward forecast, and critical margins</span>
                </span>
              )}

              {selectedIndication && (
                <div className="text-slate-500 text-[11px] font-medium hidden sm:block">
                  Flaw: <strong className="text-slate-800">{selectedIndication.code}</strong> ({selectedIndication.weldName})
                </div>
              )}
            </div>

            {/* Interactive SVG Chart Container with Floating Cursor */}
            <div className="relative mt-2">
              <svg
                ref={svgRef}
                viewBox={`0 0 ${chartConfig.width} ${chartConfig.height}`}
                className="w-full h-auto select-none overflow-visible cursor-crosshair"
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
              >
                <defs>
                  {/* Confidence cone gradient */}
                  <linearGradient id="confidenceGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor={confidenceColor} stopOpacity="0.25" />
                    <stop offset="100%" stopColor={confidenceColor} stopOpacity="0.10" />
                  </linearGradient>
                </defs>

                {/* Gridlines */}
                {chartConfig.hasData && (
                  <g className="grid-lines">
                    {/* Horizontal lines */}
                    {[0, 0.25, 0.5, 0.75, 1.0].map((ratio) => {
                      const val = ratio * chartConfig.maxY;
                      const y = chartConfig.scaleY(val);
                      return (
                        <g key={ratio}>
                          <line
                            x1={chartConfig.margin.left}
                            y1={y}
                            x2={chartConfig.width - chartConfig.margin.right}
                            y2={y}
                            stroke="#f1f5f9"
                            strokeWidth="1"
                          />
                          <text
                            x={chartConfig.margin.left - 8}
                            y={y + 4}
                            textAnchor="end"
                            fontSize="10"
                            fill="#94a3b8"
                            fontFamily="monospace"
                          >
                            {val.toFixed(0)} {displayMetric === "DEPTH" ? "mm" : ""}
                          </text>
                        </g>
                      );
                    })}

                    {/* Vertical lines and date marks */}
                    {projection?.timeSeries
                      .filter((_, idx) => idx % 4 === 0)
                      .map((pt, i) => {
                        const x = chartConfig.scaleX(pt.timestamp);
                        return (
                          <g key={i}>
                            <line
                              x1={x}
                              y1={chartConfig.margin.top}
                              x2={x}
                              y2={chartConfig.height - chartConfig.margin.bottom}
                              stroke="#f8fafc"
                              strokeWidth="1"
                            />
                            <text
                              x={x}
                              y={chartConfig.height - chartConfig.margin.bottom + 18}
                              textAnchor="middle"
                              fontSize="10"
                              fill="#64748b"
                            >
                              {pt.date.slice(0, 7)}
                            </text>
                          </g>
                        );
                      })}
                  </g>
                )}

                {/* Shaded Confidence Cone (Fan-Out) */}
                {chartConfig.hasData && projection && (
                  <g className="confidence-area">
                    {(() => {
                      const forecastPts = projection.timeSeries.filter((p) => !p.isHistorical);
                      if (forecastPts.length === 0) return null;

                      // Anchor from last historical point
                      const lastHist = projection.timeSeries.filter((p) => p.isHistorical).slice(-1)[0] || forecastPts[0];
                      const ptsToDraw = [lastHist, ...forecastPts];

                      // Forward upper bound path
                      const upperPath = ptsToDraw.map((p, i) => {
                        const x = chartConfig.scaleX(p.timestamp);
                        const val = displayMetric === "DEPTH" ? p.depthUpper : p.lengthUpper;
                        const y = chartConfig.scaleY(val);
                        return `${i === 0 ? "M" : "L"} ${x} ${y}`;
                      });

                      // Backward lower bound path
                      const lowerPath = [...ptsToDraw].reverse().map((p) => {
                        const x = chartConfig.scaleX(p.timestamp);
                        const val = displayMetric === "DEPTH" ? p.depthLower : p.lengthLower;
                        const y = chartConfig.scaleY(val);
                        return `L ${x} ${y}`;
                      });

                      const d = `${upperPath.join(" ")} ${lowerPath.join(" ")} Z`;
                      return <path d={d} fill="url(#confidenceGradient)" />;
                    })()}
                  </g>
                )}

                {/* Warning Threshold Line (User Configured Color & %) */}
                {chartConfig.hasData && displayMetric === "DEPTH" && (
                  <g className="warning-threshold">
                    <line
                      x1={chartConfig.margin.left}
                      y1={chartConfig.scaleY(warningDepthMm)}
                      x2={chartConfig.width - chartConfig.margin.right}
                      y2={chartConfig.scaleY(warningDepthMm)}
                      stroke={warningColor}
                      strokeWidth="1.75"
                      strokeDasharray="5 4"
                    />
                    <rect
                      x={chartConfig.width - chartConfig.margin.right - 145}
                      y={chartConfig.scaleY(warningDepthMm) - 16}
                      width="145"
                      height="16"
                      fill={warningColor}
                      rx="3"
                      fillOpacity="0.15"
                    />
                    <text
                      x={chartConfig.width - chartConfig.margin.right - 6}
                      y={chartConfig.scaleY(warningDepthMm) - 4}
                      textAnchor="end"
                      fontSize="9.5"
                      fontWeight="600"
                      fill={warningColor}
                    >
                      {warningPercent}% Warning ({warningDepthMm.toFixed(1)} mm)
                    </text>
                  </g>
                )}

                {/* Critical Through-Wall Threshold Line (User Configured Color & %) */}
                {chartConfig.hasData && displayMetric === "DEPTH" && (
                  <g className="critical-threshold">
                    <line
                      x1={chartConfig.margin.left}
                      y1={chartConfig.scaleY(criticalDepthMm)}
                      x2={chartConfig.width - chartConfig.margin.right}
                      y2={chartConfig.scaleY(criticalDepthMm)}
                      stroke={criticalColor}
                      strokeWidth="2.25"
                    />
                    <rect
                      x={chartConfig.width - chartConfig.margin.right - 160}
                      y={chartConfig.scaleY(criticalDepthMm) - 16}
                      width="160"
                      height="16"
                      fill={criticalColor}
                      rx="3"
                      fillOpacity="0.15"
                    />
                    <text
                      x={chartConfig.width - chartConfig.margin.right - 6}
                      y={chartConfig.scaleY(criticalDepthMm) - 4}
                      textAnchor="end"
                      fontSize="9.5"
                      fontWeight="700"
                      fill={criticalColor}
                    >
                      {criticalPercent}% Wall Limit ({criticalDepthMm.toFixed(1)} mm)
                    </text>
                  </g>
                )}

                {/* Recommended Turnaround Window Marker */}
                {chartConfig.hasData && projection?.exceedance.recommendedTurnaroundDate && (
                  <g className="turnaround-marker">
                    {(() => {
                      const taTime = new Date(projection.exceedance.recommendedTurnaroundDate).getTime();
                      if (taTime >= chartConfig.minTime && taTime <= chartConfig.maxTime) {
                        const taX = chartConfig.scaleX(taTime);
                        return (
                          <>
                            <line
                              x1={taX}
                              y1={chartConfig.margin.top}
                              x2={taX}
                              y2={chartConfig.height - chartConfig.margin.bottom}
                              stroke="#0284c7"
                              strokeWidth="1.5"
                              strokeDasharray="4 3"
                            />
                            <text
                              x={taX}
                              y={chartConfig.margin.top - 8}
                              textAnchor="middle"
                              fontSize="9.5"
                              fontWeight="600"
                              fill="#0284c7"
                            >
                              Turnaround Window
                            </text>
                          </>
                        );
                      }
                      return null;
                    })()}
                  </g>
                )}

                {/* Dashed Future Projection Curve */}
                {chartConfig.hasData && projection && (
                  <g className="projection-curve">
                    {(() => {
                      const hist = projection.timeSeries.filter((p) => p.isHistorical);
                      const future = projection.timeSeries.filter((p) => !p.isHistorical);
                      if (future.length === 0) return null;

                      const anchor = hist.length > 0 ? hist[hist.length - 1] : future[0];
                      const pts = [anchor, ...future];

                      const pathData = pts.map((p, i) => {
                        const x = chartConfig.scaleX(p.timestamp);
                        const val = displayMetric === "DEPTH" ? p.depth : p.length;
                        const y = chartConfig.scaleY(val);
                        return `${i === 0 ? "M" : "L"} ${x} ${y}`;
                      }).join(" ");

                      return (
                        <path
                          d={pathData}
                          fill="none"
                          stroke={curveColor}
                          strokeWidth="2.5"
                          strokeDasharray="6 4"
                        />
                      );
                    })()}
                  </g>
                )}

                {/* Solid Historical Measurements Curve */}
                {chartConfig.hasData && projection && (
                  <g className="historical-curve">
                    {(() => {
                      const hist = projection.timeSeries.filter((p) => p.isHistorical);
                      if (hist.length === 0) return null;

                      const pathData = hist.map((p, i) => {
                        const x = chartConfig.scaleX(p.timestamp);
                        const val = displayMetric === "DEPTH" ? p.depth : p.length;
                        const y = chartConfig.scaleY(val);
                        return `${i === 0 ? "M" : "L"} ${x} ${y}`;
                      }).join(" ");

                      return (
                        <path
                          d={pathData}
                          fill="none"
                          stroke={curveColor}
                          strokeWidth="3.2"
                        />
                      );
                    })()}

                    {/* Historical Observation Markers */}
                    {projection.timeSeries
                      .filter((p) => p.isHistorical)
                      .map((p, idx) => {
                        const x = chartConfig.scaleX(p.timestamp);
                        const val = displayMetric === "DEPTH" ? p.depth : p.length;
                        const y = chartConfig.scaleY(val);
                        return (
                          <g key={idx}>
                            <circle
                              cx={x}
                              cy={y}
                              r="5"
                              fill="#ffffff"
                              stroke={curveColor}
                              strokeWidth="2.5"
                            />
                            {p.campaignName && (
                              <text
                                x={x}
                                y={y - 10}
                                textAnchor="middle"
                                fontSize="9"
                                fontWeight="700"
                                fill="#0f172a"
                              >
                                {p.campaignName}
                              </text>
                            )}
                          </g>
                        );
                      })}
                  </g>
                )}

                {/* Floating Crosshair Cursor & Indicator Ring */}
                {hoverData && chartConfig.hasData && (
                  <g className="floating-cursor pointer-events-none">
                    {/* Vertical tracking crosshair */}
                    <line
                      x1={hoverData.x}
                      y1={chartConfig.margin.top}
                      x2={hoverData.x}
                      y2={chartConfig.height - chartConfig.margin.bottom}
                      stroke="#64748b"
                      strokeWidth="1.2"
                      strokeDasharray="3 3"
                    />

                    {/* Hollow reticle with clear center so curve and points beneath are 100% visible */}
                    <circle
                      cx={hoverData.x}
                      cy={hoverData.y}
                      r="7"
                      fill="none"
                      stroke={curveColor}
                      strokeWidth="1.75"
                    />
                    <circle
                      cx={hoverData.x}
                      cy={hoverData.y}
                      r="1.75"
                      fill={curveColor}
                    />
                  </g>
                )}
              </svg>

              {/* Docked Inspector HUD Card — Always stays in opposite corner away from cursor */}
              {hoverData && (
                <div
                  className={`absolute pointer-events-none z-20 bg-white/95 backdrop-blur-md border border-slate-200 rounded-lg shadow-xl p-3 text-xs text-slate-800 transition-all duration-100 ${
                    hoverData.x > chartConfig.width / 2 ? "left-4 top-4" : "right-4 top-4"
                  }`}
                  style={{
                    minWidth: "220px",
                  }}
                >
                  <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-100">
                    <span className="font-bold text-slate-900">{hoverData.point.date}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                        hoverData.point.isHistorical
                          ? "bg-sky-100 text-sky-800"
                          : "bg-purple-100 text-purple-800"
                      }`}
                    >
                      {hoverData.point.isHistorical ? hoverData.point.campaignName || "Measured" : "Projected"}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Depth:</span>
                      <span className="font-semibold text-slate-900">
                        {hoverData.point.depth.toFixed(2)} mm (
                        {((hoverData.point.depth / nominalWallThickness) * 100).toFixed(1)}%)
                      </span>
                    </div>

                    {!hoverData.point.isHistorical && (
                      <div className="flex justify-between text-[11px] text-slate-500">
                        <span>Confidence Fan:</span>
                        <span className="font-mono">
                          [{hoverData.point.depthLower.toFixed(1)} - {hoverData.point.depthUpper.toFixed(1)}] mm
                        </span>
                      </div>
                    )}

                    <div className="flex justify-between">
                      <span className="text-slate-500">Length:</span>
                      <span className="font-semibold text-slate-900">{hoverData.point.length.toFixed(1)} mm</span>
                    </div>

                    <div className="flex justify-between pt-1 border-t border-slate-100">
                      <span className="text-slate-500">Margin to Warning:</span>
                      <span
                        className={`font-semibold ${
                          hoverData.point.depth >= warningDepthMm ? "text-amber-600" : "text-emerald-600"
                        }`}
                      >
                        {hoverData.point.depth >= warningDepthMm
                          ? "BREACHED"
                          : `+${(warningDepthMm - hoverData.point.depth).toFixed(1)} mm`}
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-slate-500">Margin to Wall:</span>
                      <span
                        className={`font-semibold ${
                          hoverData.point.depth >= criticalDepthMm ? "text-red-600" : "text-slate-800"
                        }`}
                      >
                        {hoverData.point.depth >= criticalDepthMm
                          ? "PENETRATED"
                          : `+${(criticalDepthMm - hoverData.point.depth).toFixed(1)} mm`}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Formula & Engineering Parameters Callout */}
            {projection && (
              <div className="mt-4 p-3.5 bg-slate-50 rounded-lg border border-slate-200/80 flex flex-wrap items-center justify-between gap-4 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-700">Fitted Equation:</span>
                  <code className="bg-white px-2 py-1 rounded border border-slate-200 text-sky-800 font-mono text-[11px]">
                    {modelType === "LINEAR"
                      ? `Depth(t) = ${projection.fitParams.depthIntercept.toFixed(2)} + ${projection.annualDepthRateMmYear.toFixed(2)} · t`
                      : `Depth(t) = ${projection.fitParams.depthIntercept.toFixed(2)} · e^(${projection.fitParams.depthSlope.toFixed(3)} · t)`}
                  </code>
                </div>
                <div className="flex items-center gap-4 text-slate-600 font-mono">
                  <span>Growth Rate: <strong className="text-slate-900">{projection.annualDepthRateMmYear} mm/yr</strong></span>
                  <span>R²: <strong className="text-slate-900">{projection.fitParams.depthR2.toFixed(3)}</strong></span>
                  <span>StdErr: <strong className="text-slate-900">{projection.fitParams.depthStdError.toFixed(2)} mm</strong></span>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Custom Color Codes & Threshold % Configuration Panel */}
          <div className="lg:col-span-4 bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Sliders size={18} className="text-sky-600" />
                <h3 className="font-bold text-slate-900 text-sm">Thresholds & Custom Colors</h3>
              </div>
              <button
                onClick={resetThresholds}
                title="Reset to engineering defaults"
                className="text-xs text-slate-500 hover:text-sky-700 flex items-center gap-1 transition"
              >
                <RotateCcw size={12} /> Reset
              </button>
            </div>

            {/* Section 1: Wall Thickness & Threshold % (User Configurable) */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                <span>Wall Loss Thresholds</span>
              </h4>

              {/* Warning Threshold Slider & Input */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-medium text-slate-700">Warning Alert (% of Wall):</span>
                  <span className="font-bold text-slate-900 font-mono">{warningPercent}% ({warningDepthMm.toFixed(1)} mm)</span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="95"
                  step="1"
                  value={warningPercent}
                  onChange={(e) => setWarningPercent(Number(e.target.value))}
                  className="w-full accent-amber-500 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
                />
              </div>

              {/* Critical / Through-Wall Threshold Slider & Input */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-medium text-slate-700">Through-Wall Limit (% of Wall):</span>
                  <span className="font-bold text-slate-900 font-mono">{criticalPercent}% ({criticalDepthMm.toFixed(1)} mm)</span>
                </div>
                <input
                  type="range"
                  min="80"
                  max="120"
                  step="1"
                  value={criticalPercent}
                  onChange={(e) => setCriticalPercent(Number(e.target.value))}
                  className="w-full accent-red-600 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
                />
              </div>

              {/* Nominal Wall Thickness Input */}
              <div className="flex items-center justify-between text-xs pt-1">
                <span className="font-medium text-slate-700">Nominal Thickness:</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    step="0.5"
                    min="10"
                    max="60"
                    value={nominalWallThickness}
                    onChange={(e) => setNominalWallThickness(Math.max(1, Number(e.target.value)))}
                    className="w-16 px-2 py-1 border border-slate-300 rounded font-mono text-right text-xs focus:ring-1 focus:ring-sky-500"
                  />
                  <span className="text-slate-500">mm</span>
                </div>
              </div>
            </div>

            {/* Section 2: Custom Color Codes (User Selectable beside the graph) */}
            <div className="space-y-4 pt-4 border-t border-slate-100">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Graph Color Codes
              </h4>

              {/* Warning Threshold Line Color */}
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700 flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: warningColor }}></span>
                  Warning Threshold:
                </span>
                <div className="flex items-center gap-1.5">
                  {["#f59e0b", "#ea580c", "#eab308", "#d97706"].map((c) => (
                    <button
                      key={c}
                      onClick={() => setWarningColor(c)}
                      className={`w-5 h-5 rounded-full border-2 transition ${
                        warningColor === c ? "border-slate-800 scale-110" : "border-white"
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                  <input
                    type="color"
                    value={warningColor}
                    onChange={(e) => setWarningColor(e.target.value)}
                    className="w-6 h-6 p-0 border-0 rounded cursor-pointer ml-1"
                    title="Choose custom color"
                  />
                </div>
              </div>

              {/* Critical Threshold Line Color */}
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700 flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: criticalColor }}></span>
                  Through-Wall Line:
                </span>
                <div className="flex items-center gap-1.5">
                  {["#ef4444", "#dc2626", "#b91c1c", "#be123c"].map((c) => (
                    <button
                      key={c}
                      onClick={() => setCriticalColor(c)}
                      className={`w-5 h-5 rounded-full border-2 transition ${
                        criticalColor === c ? "border-slate-800 scale-110" : "border-white"
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                  <input
                    type="color"
                    value={criticalColor}
                    onChange={(e) => setCriticalColor(e.target.value)}
                    className="w-6 h-6 p-0 border-0 rounded cursor-pointer ml-1"
                    title="Choose custom color"
                  />
                </div>
              </div>

              {/* Forecast Curve Line Color */}
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700 flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: curveColor }}></span>
                  Forecast Curve:
                </span>
                <div className="flex items-center gap-1.5">
                  {["#0284c7", "#2563eb", "#4f46e5", "#0d9488"].map((c) => (
                    <button
                      key={c}
                      onClick={() => setCurveColor(c)}
                      className={`w-5 h-5 rounded-full border-2 transition ${
                        curveColor === c ? "border-slate-800 scale-110" : "border-white"
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                  <input
                    type="color"
                    value={curveColor}
                    onChange={(e) => setCurveColor(e.target.value)}
                    className="w-6 h-6 p-0 border-0 rounded cursor-pointer ml-1"
                    title="Choose custom color"
                  />
                </div>
              </div>

              {/* Confidence Band Tint Color */}
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700 flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: confidenceColor }}></span>
                  Confidence Band:
                </span>
                <div className="flex items-center gap-1.5">
                  {["#38bdf8", "#818cf8", "#34d399", "#a78bfa"].map((c) => (
                    <button
                      key={c}
                      onClick={() => setConfidenceColor(c)}
                      className={`w-5 h-5 rounded-full border-2 transition ${
                        confidenceColor === c ? "border-slate-800 scale-110" : "border-white"
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                  <input
                    type="color"
                    value={confidenceColor}
                    onChange={(e) => setConfidenceColor(e.target.value)}
                    className="w-6 h-6 p-0 border-0 rounded cursor-pointer ml-1"
                    title="Choose custom color"
                  />
                </div>
              </div>
            </div>

            {/* Section 3: Flaw Forecast Quick Details */}
            {projection && (
              <div className="pt-4 border-t border-slate-100 space-y-2 text-xs">
                <h4 className="font-bold text-slate-700 uppercase tracking-wider">
                  Forecast Summary
                </h4>
                <div className="bg-slate-50 p-3 rounded-lg space-y-2 border border-slate-200">
                  <div className="flex justify-between">
                    <span className="text-slate-500">80% Warning Date:</span>
                    <span className="font-bold text-amber-700">
                      {projection.exceedance.warningDate
                        ? `${new Date(projection.exceedance.warningDate).toISOString().split("T")[0]} (${projection.exceedance.warningDaysRemaining} d)`
                        : "Safe (>15 yrs)"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">100% Penetration:</span>
                    <span className="font-bold text-red-600">
                      {projection.exceedance.criticalDate
                        ? `${new Date(projection.exceedance.criticalDate).toISOString().split("T")[0]} (${projection.exceedance.criticalDaysRemaining} d)`
                        : "Safe (>15 yrs)"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Recommended Next Turnaround:</span>
                    <span className="font-semibold text-sky-800">
                      {projection.exceedance.recommendedTurnaroundDate
                        ? new Date(projection.exceedance.recommendedTurnaroundDate).toISOString().split("T")[0]
                        : "2027-10-01"}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Flaw Prioritization & Ranking Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Flaw Prioritization & Threshold Ranking</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Indications ranked by urgency to reach warning and penetration limits
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-600"></span> Critical Risk</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500"></span> High Risk</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-sky-500"></span> Moderate</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> Low / Stable</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-500 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Risk Tier</th>
                  <th className="px-4 py-3">Flaw Code</th>
                  <th className="px-4 py-3">Weld Joint</th>
                  <th className="px-4 py-3 text-right">Location (mm)</th>
                  <th className="px-4 py-3 text-right">Current Depth</th>
                  <th className="px-4 py-3 text-right">% Wall</th>
                  <th className="px-4 py-3 text-right">Rate (mm/yr)</th>
                  <th className="px-4 py-3">Projected Warning Date</th>
                  <th className="px-4 py-3">Projected Wall Limit</th>
                  <th className="px-4 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {overview?.indications.map((item) => {
                  const isSelected = item.id === selectedIndicationId;
                  const tierColors: Record<string, string> = {
                    CRITICAL: "bg-red-50 text-red-700 border-red-200",
                    HIGH: "bg-amber-50 text-amber-700 border-amber-200",
                    MODERATE: "bg-sky-50 text-sky-700 border-sky-200",
                    LOW: "bg-emerald-50 text-emerald-700 border-emerald-200",
                  };

                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-sky-50/40 transition cursor-pointer ${
                        isSelected ? "bg-sky-50/70 font-medium" : ""
                      }`}
                      onClick={() => setSelectedIndicationId(item.id)}
                    >
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${
                            tierColors[item.riskTier] || "bg-slate-50 text-slate-700 border-slate-200"
                          }`}
                        >
                          {item.riskTier}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{item.code}</td>
                      <td className="px-4 py-3 text-slate-600">{item.weldName}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-600">
                        {Math.round(item.circumferentialPosition)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900 font-mono">
                        {item.currentDepth.toFixed(1)} mm
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-700">
                        {item.depthPercentOfWall.toFixed(1)}%
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-sky-700 font-mono">
                        +{item.annualDepthRateMmYear.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 font-mono text-amber-800">
                        {item.warningDate ? (
                          <span>
                            {item.warningDate}{" "}
                            <span className="text-[10px] text-slate-400">({item.warningDaysRemaining}d)</span>
                          </span>
                        ) : (
                          <span className="text-slate-400">&gt; 5 yrs</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-red-700">
                        {item.criticalDate ? (
                          <span>
                            {item.criticalDate}{" "}
                            <span className="text-[10px] text-slate-400">({item.criticalDaysRemaining}d)</span>
                          </span>
                        ) : (
                          <span className="text-slate-400">&gt; 5 yrs</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedIndicationId(item.id);
                          }}
                          className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1 mx-auto transition ${
                            isSelected
                              ? "bg-sky-600 text-white shadow-xs"
                              : "bg-slate-100 text-slate-700 hover:bg-sky-100 hover:text-sky-800"
                          }`}
                        >
                          Inspect <ArrowUpRight size={12} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
