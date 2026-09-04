"use client";

import { useState, useRef, useMemo } from "react";
import { 
  generateGrowthPrediction, 
  HistoricalMeasurement, 
  PredictionModelType, 
  ScenarioType, 
  PredictionResult 
} from "@/lib/prediction/growthModel";
import { Sliders, RotateCcw } from "lucide-react";

interface PredictiveForecastChartProps {
  measurements: HistoricalMeasurement[];
  flawCode: string;
  locationInfo?: string;
  nominalThickness?: number;
  initialWarningPercent?: number;
  initialCriticalPercent?: number;
}

export function PredictiveForecastChart({
  measurements,
  flawCode,
  locationInfo,
  nominalThickness: propThickness = 32.0,
  initialWarningPercent = 80,
  initialCriticalPercent = 100,
}: PredictiveForecastChartProps) {
  // Model & Scenario Controls
  const [modelType, setModelType] = useState<PredictionModelType>("LINEAR");
  const [scenario, setScenario] = useState<ScenarioType>("MODERATE");
  const [displayMetric, setDisplayMetric] = useState<"DEPTH" | "LENGTH">("DEPTH");

  // User Configurable Thresholds & Custom Color Codes (Beside the Graph)
  const [nominalWallThickness, setNominalWallThickness] = useState<number>(propThickness);
  const [warningPercent, setWarningPercent] = useState<number>(initialWarningPercent);
  const [criticalPercent, setCriticalPercent] = useState<number>(initialCriticalPercent);
  const [warningColor, setWarningColor] = useState<string>("#f59e0b"); // Amber
  const [criticalColor, setCriticalColor] = useState<string>("#ef4444"); // Red
  const [curveColor, setCurveColor] = useState<string>("#0284c7"); // Sky Blue
  const [confidenceColor, setConfidenceColor] = useState<string>("#38bdf8"); // Sky Light

  // Floating Cursor State
  const [hoverData, setHoverData] = useState<{
    x: number;
    y: number;
    point: any;
  } | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);

  // Calculate prediction result
  const projection: PredictionResult | null = useMemo(() => {
    if (!measurements || measurements.length === 0) return null;
    try {
      return generateGrowthPrediction(measurements, {
        modelType,
        scenario,
        thresholds: {
          nominalWallThickness,
          warningThresholdPercent: warningPercent,
          criticalThresholdPercent: criticalPercent,
          criticalLengthLimit: 500.0,
        },
      });
    } catch (err) {
      console.error("Error generating prediction:", err);
      return null;
    }
  }, [measurements, modelType, scenario, nominalWallThickness, warningPercent, criticalPercent]);

  // Derived threshold values in mm
  const warningDepthMm = (nominalWallThickness * warningPercent) / 100.0;
  const criticalDepthMm = (nominalWallThickness * criticalPercent) / 100.0;

  // SVG Chart Geometry & Scaling
  const chartConfig = useMemo(() => {
    const width = 760;
    const height = 360;
    const margin = { top: 35, right: 35, bottom: 45, left: 60 };
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

    if (
      mouseX < chartConfig.margin.left ||
      mouseX > chartConfig.width - chartConfig.margin.right ||
      mouseY < chartConfig.margin.top ||
      mouseY > chartConfig.height - chartConfig.margin.bottom
    ) {
      setHoverData(null);
      return;
    }

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

  if (!projection) {
    return (
      <div className="p-8 text-center bg-white rounded-xl border border-slate-200 text-slate-500 text-sm">
        No measurement history available to generate a growth forecast for this flaw.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-5">
      {/* Top Header of Chart */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-900 text-base">Growth & Predictive Forecast: {flawCode}</span>
            {locationInfo && (
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-100">
                {locationInfo}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Hover over the curves to see exact values. Adjust thickness % and colors in the right panel.
          </p>
        </div>

        {/* Toggles */}
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

      {/* Main Grid: Chart on Left, Color Codes & Thresholds on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: SVG Chart */}
        <div className="lg:col-span-8 relative">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${chartConfig.width} ${chartConfig.height}`}
            className="w-full h-auto select-none overflow-visible cursor-crosshair"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            <defs>
              <linearGradient id="forecastConfGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor={confidenceColor} stopOpacity="0.25" />
                <stop offset="100%" stopColor={confidenceColor} stopOpacity="0.10" />
              </linearGradient>
            </defs>

            {/* Gridlines */}
            {chartConfig.hasData && (
              <g className="grid-lines">
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

                {projection.timeSeries
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

            {/* Confidence Area */}
            {chartConfig.hasData && (
              <g className="confidence-area">
                {(() => {
                  const forecastPts = projection.timeSeries.filter((p) => !p.isHistorical);
                  if (forecastPts.length === 0) return null;
                  const lastHist = projection.timeSeries.filter((p) => p.isHistorical).slice(-1)[0] || forecastPts[0];
                  const ptsToDraw = [lastHist, ...forecastPts];

                  const upperPath = ptsToDraw.map((p, i) => {
                    const x = chartConfig.scaleX(p.timestamp);
                    const val = displayMetric === "DEPTH" ? p.depthUpper : p.lengthUpper;
                    const y = chartConfig.scaleY(val);
                    return `${i === 0 ? "M" : "L"} ${x} ${y}`;
                  });

                  const lowerPath = [...ptsToDraw].reverse().map((p) => {
                    const x = chartConfig.scaleX(p.timestamp);
                    const val = displayMetric === "DEPTH" ? p.depthLower : p.lengthLower;
                    const y = chartConfig.scaleY(val);
                    return `L ${x} ${y}`;
                  });

                  return <path d={`${upperPath.join(" ")} ${lowerPath.join(" ")} Z`} fill="url(#forecastConfGradient)" />;
                })()}
              </g>
            )}

            {/* Warning Threshold Line */}
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

            {/* Critical Wall Penetration Threshold Line */}
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

            {/* Dashed Future Projection Curve */}
            {chartConfig.hasData && (
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
            {chartConfig.hasData && (
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

                {/* Observation markers */}
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
                <line
                  x1={hoverData.x}
                  y1={chartConfig.margin.top}
                  x2={hoverData.x}
                  y2={chartConfig.height - chartConfig.margin.bottom}
                  stroke="#64748b"
                  strokeWidth="1.2"
                  strokeDasharray="3 3"
                />
                <circle
                  cx={hoverData.x}
                  cy={hoverData.y}
                  r="9"
                  fill={curveColor}
                  fillOpacity="0.2"
                />
                <circle
                  cx={hoverData.x}
                  cy={hoverData.y}
                  r="4.5"
                  fill="#ffffff"
                  stroke={curveColor}
                  strokeWidth="2.5"
                />
              </g>
            )}
          </svg>

          {/* Floating Tooltip Card */}
          {hoverData && (
            <div
              className="absolute pointer-events-none z-20 bg-white/95 backdrop-blur-md border border-slate-200 rounded-lg shadow-xl p-3 text-xs text-slate-800 transition-all duration-75"
              style={{
                left: `${Math.min(hoverData.x + 12, chartConfig.width - 210)}px`,
                top: `${Math.max(10, Math.min(hoverData.y - 45, chartConfig.height - 140))}px`,
                minWidth: "200px",
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
                    <span>Confidence:</span>
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

          {/* Equation callout */}
          <div className="mt-3 p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-xs flex flex-wrap items-center justify-between gap-3">
            <span className="font-mono text-slate-700">
              Rate: <strong className="text-sky-700">+{projection.annualDepthRateMmYear} mm/yr</strong> (R²: {projection.fitParams.depthR2.toFixed(3)})
            </span>
            <span className="text-slate-500 font-mono">
              Warning Breach: <strong className="text-amber-700">{projection.exceedance.warningDate ? projection.exceedance.warningDate.toISOString().split("T")[0] : ">10 yrs"}</strong>
            </span>
          </div>
        </div>

        {/* Right: Custom Color Codes & % Thickness Settings Panel */}
        <div className="lg:col-span-4 bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4 text-xs">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <div className="flex items-center gap-1.5 font-bold text-slate-800">
              <Sliders size={15} className="text-sky-600" />
              <span>Threshold & Color Settings</span>
            </div>
            <button
              onClick={resetThresholds}
              className="text-slate-500 hover:text-sky-700 flex items-center gap-1"
            >
              <RotateCcw size={11} /> Reset
            </button>
          </div>

          {/* Threshold Sliders */}
          <div className="space-y-3">
            <div>
              <div className="flex justify-between font-medium text-slate-700 mb-1">
                <span>Warning (% of Wall):</span>
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

            <div>
              <div className="flex justify-between font-medium text-slate-700 mb-1">
                <span>Through-Wall (% of Wall):</span>
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

            <div className="flex justify-between items-center pt-1">
              <span className="font-medium text-slate-700">Nominal Wall:</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step="0.5"
                  min="10"
                  max="60"
                  value={nominalWallThickness}
                  onChange={(e) => setNominalWallThickness(Math.max(1, Number(e.target.value)))}
                  className="w-16 px-1.5 py-0.5 border border-slate-300 rounded font-mono text-right bg-white"
                />
                <span className="text-slate-500">mm</span>
              </div>
            </div>
          </div>

          {/* Color Code Selectors */}
          <div className="space-y-2.5 pt-3 border-t border-slate-200">
            <span className="font-bold text-slate-700 uppercase tracking-wider text-[11px]">
              Custom Colors Beside Graph
            </span>

            {/* Warning Color */}
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-slate-700">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: warningColor }} />
                Warning Line:
              </span>
              <div className="flex items-center gap-1">
                {["#f59e0b", "#ea580c", "#eab308"].map((c) => (
                  <button
                    key={c}
                    onClick={() => setWarningColor(c)}
                    className={`w-4 h-4 rounded-full border ${warningColor === c ? "border-slate-800 scale-110" : "border-white"}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <input
                  type="color"
                  value={warningColor}
                  onChange={(e) => setWarningColor(e.target.value)}
                  className="w-5 h-5 p-0 border-0 rounded cursor-pointer ml-1"
                />
              </div>
            </div>

            {/* Critical Color */}
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-slate-700">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: criticalColor }} />
                Wall Limit:
              </span>
              <div className="flex items-center gap-1">
                {["#ef4444", "#dc2626", "#b91c1c"].map((c) => (
                  <button
                    key={c}
                    onClick={() => setCriticalColor(c)}
                    className={`w-4 h-4 rounded-full border ${criticalColor === c ? "border-slate-800 scale-110" : "border-white"}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <input
                  type="color"
                  value={criticalColor}
                  onChange={(e) => setCriticalColor(e.target.value)}
                  className="w-5 h-5 p-0 border-0 rounded cursor-pointer ml-1"
                />
              </div>
            </div>

            {/* Curve Color */}
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-slate-700">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: curveColor }} />
                Forecast Curve:
              </span>
              <div className="flex items-center gap-1">
                {["#0284c7", "#2563eb", "#4f46e5"].map((c) => (
                  <button
                    key={c}
                    onClick={() => setCurveColor(c)}
                    className={`w-4 h-4 rounded-full border ${curveColor === c ? "border-slate-800 scale-110" : "border-white"}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <input
                  type="color"
                  value={curveColor}
                  onChange={(e) => setCurveColor(e.target.value)}
                  className="w-5 h-5 p-0 border-0 rounded cursor-pointer ml-1"
                />
              </div>
            </div>

            {/* Confidence Band Color */}
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-slate-700">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: confidenceColor }} />
                Confidence Band:
              </span>
              <div className="flex items-center gap-1">
                {["#38bdf8", "#818cf8", "#34d399"].map((c) => (
                  <button
                    key={c}
                    onClick={() => setConfidenceColor(c)}
                    className={`w-4 h-4 rounded-full border ${confidenceColor === c ? "border-slate-800 scale-110" : "border-white"}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <input
                  type="color"
                  value={confidenceColor}
                  onChange={(e) => setConfidenceColor(e.target.value)}
                  className="w-5 h-5 p-0 border-0 rounded cursor-pointer ml-1"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
