"use client";

import { useState, useMemo } from "react";
import { ReportIndicationItem } from "@/lib/reports/reportTypes";
import { History, TrendingUp, BarChart3, AlertCircle, ArrowUpRight } from "lucide-react";

interface WeldHistoricalVsCurrentGraphProps {
  indications: ReportIndicationItem[];
  campaignNames: string[];
  weldName: string;
  nominalWallThickness?: number;
  selectedFlawCode?: string;
  onSelectFlaw?: (code: string) => void;
}

export function WeldHistoricalVsCurrentGraph({
  indications,
  campaignNames,
  weldName,
  nominalWallThickness = 32.0,
  selectedFlawCode,
  onSelectFlaw,
}: WeldHistoricalVsCurrentGraphProps) {
  const [metricMode, setMetricMode] = useState<"DEPTH" | "LENGTH" | "DELTA">("DEPTH");
  const [hoveredFlawCode, setHoveredFlawCode] = useState<string | null>(null);

  // Filter flaws that belong to this weld or have valid measurements
  const validIndications = useMemo(() => {
    return (indications || []).filter(
      (ind) => ind.campaignHistory && ind.campaignHistory.length > 0
    );
  }, [indications]);

  // Determine earliest campaign name (baseline) and latest campaign name (current)
  const baselineCampaign = campaignNames.length > 0 ? campaignNames[0] : "Baseline";
  const currentCampaign = campaignNames.length > 0 ? campaignNames[campaignNames.length - 1] : "Current";

  // Compute stats across indications for this weld
  const stats = useMemo(() => {
    if (validIndications.length === 0) {
      return { maxDelta: 0, avgRate: 0, progressedCount: 0 };
    }

    let maxDelta = 0;
    let sumRate = 0;
    let progressedCount = 0;

    validIndications.forEach((ind) => {
      const hist = ind.campaignHistory || [];
      if (hist.length > 1) {
        const first = hist[0];
        const last = hist[hist.length - 1];
        const delta = Math.max(0, last.depth - first.depth);
        if (delta > maxDelta) maxDelta = delta;
        if (delta > 0.2) progressedCount++;
      }
      sumRate += ind.growthRateYear || 0;
    });

    const avgRate = Number((sumRate / validIndications.length).toFixed(2));
    return { maxDelta: Number(maxDelta.toFixed(2)), avgRate, progressedCount };
  }, [validIndications]);

  // SVG dimensions & scaling
  const chartConfig = useMemo(() => {
    const width = 860;
    const height = 360;
    const margin = { top: 35, right: 30, bottom: 55, left: 60 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    if (validIndications.length === 0) {
      return { width, height, margin, innerWidth, innerHeight, maxVal: 40, barGroupWidth: 40 };
    }

    let maxVal = 20;
    if (metricMode === "DEPTH") {
      const maxD = Math.max(
        ...validIndications.map((i) => i.currentDepth),
        nominalWallThickness * 0.8
      );
      maxVal = Math.max(nominalWallThickness, maxD * 1.15);
    } else if (metricMode === "LENGTH") {
      const maxL = Math.max(...validIndications.map((i) => i.currentLength), 50);
      maxVal = maxL * 1.15;
    } else {
      // DELTA
      const maxDelta = Math.max(
        ...validIndications.map((i) => {
          const hist = i.campaignHistory || [];
          if (hist.length < 2) return i.currentDepth * 0.2;
          return Math.max(0.5, hist[hist.length - 1].depth - hist[0].depth);
        }),
        3.0
      );
      maxVal = maxDelta * 1.25;
    }

    const barGroupWidth = innerWidth / validIndications.length;

    return { width, height, margin, innerWidth, innerHeight, maxVal, barGroupWidth };
  }, [validIndications, metricMode, nominalWallThickness]);

  const getY = (val: number) => {
    const clamped = Math.max(0, val);
    const ratio = clamped / (chartConfig.maxVal || 1);
    return chartConfig.margin.top + chartConfig.innerHeight - ratio * chartConfig.innerHeight;
  };

  const getHeight = (val: number) => {
    const clamped = Math.max(0, val);
    const ratio = clamped / (chartConfig.maxVal || 1);
    return ratio * chartConfig.innerHeight;
  };

  if (validIndications.length === 0) {
    return (
      <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200 text-slate-500 text-xs">
        <History size={24} className="mx-auto text-slate-400 mb-2" />
        No historical campaign comparison data recorded for Weld {weldName}.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-sky-100 text-sky-800 flex items-center justify-center font-bold text-xs">
            <TrendingUp size={15} />
          </div>
          <div>
            <h4 className="font-bold text-slate-900 text-xs sm:text-sm flex items-center gap-2">
              Historical vs. Current Inspection Comparison: Weld {weldName}
            </h4>
            <p className="text-[11px] text-slate-500">
              Comparative flaw dimensions across campaigns ({baselineCampaign} vs. {currentCampaign})
            </p>
          </div>
        </div>

        {/* Metric Toggles */}
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
            <button
              onClick={() => setMetricMode("DEPTH")}
              className={`px-2.5 py-1 font-semibold rounded-md transition ${
                metricMode === "DEPTH"
                  ? "bg-white text-sky-800 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Through-Depth (mm)
            </button>
            <button
              onClick={() => setMetricMode("LENGTH")}
              className={`px-2.5 py-1 font-semibold rounded-md transition ${
                metricMode === "LENGTH"
                  ? "bg-white text-sky-800 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Length (mm)
            </button>
            <button
              onClick={() => setMetricMode("DELTA")}
              className={`px-2.5 py-1 font-semibold rounded-md transition ${
                metricMode === "DELTA"
                  ? "bg-white text-amber-700 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Net Growth (Δ)
            </button>
          </div>
        </div>
      </div>

      {/* KPI Stats Ribbon */}
      <div className="grid grid-cols-3 gap-3 text-xs bg-slate-50/80 p-2.5 rounded-lg border border-slate-200">
        <div className="flex items-center gap-2">
          <div className="text-slate-500 font-medium">Seam Indications:</div>
          <span className="font-bold font-mono text-slate-900">{validIndications.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-slate-500 font-medium">Avg Seam Growth:</div>
          <span className="font-bold font-mono text-amber-700">+{stats.avgRate} mm/yr</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-slate-500 font-medium">Max Growth Delta:</div>
          <span className="font-bold font-mono text-red-600">+{stats.maxDelta} mm</span>
        </div>
      </div>

      {/* Main SVG Comparison Chart */}
      <div className="relative overflow-x-auto">
        <svg
          viewBox={`0 0 ${chartConfig.width} ${chartConfig.height}`}
          className="w-full h-auto min-h-[300px] select-none"
        >
          {/* Y-Axis Gridlines */}
          {[0, 0.25, 0.5, 0.75, 1.0].map((ratio) => {
            const val = ratio * chartConfig.maxVal;
            const y = getY(val);
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
                  {val.toFixed(metricMode === "DELTA" ? 1 : 0)}
                  {metricMode === "DEPTH" || metricMode === "DELTA" ? "mm" : ""}
                </text>
              </g>
            );
          })}

          {/* Nominal Wall Line if in Depth Mode */}
          {metricMode === "DEPTH" && (
            <g>
              <line
                x1={chartConfig.margin.left}
                y1={getY(nominalWallThickness)}
                x2={chartConfig.width - chartConfig.margin.right}
                y2={getY(nominalWallThickness)}
                stroke="#ef4444"
                strokeWidth="1.5"
                strokeDasharray="4 3"
              />
              <text
                x={chartConfig.width - chartConfig.margin.right - 4}
                y={getY(nominalWallThickness) - 4}
                textAnchor="end"
                fontSize="9"
                fill="#ef4444"
                fontWeight="bold"
              >
                Nominal Wall ({nominalWallThickness}mm)
              </text>
            </g>
          )}

          {/* Render Flaw Bar Groups */}
          {validIndications.map((ind, idx) => {
            const groupX = chartConfig.margin.left + idx * chartConfig.barGroupWidth;
            const centerX = groupX + chartConfig.barGroupWidth / 2;
            const isSelected = ind.code === selectedFlawCode;
            const isHovered = ind.code === hoveredFlawCode;

            const hist = ind.campaignHistory || [];
            const baseVal =
              hist.length > 0
                ? metricMode === "DEPTH"
                  ? hist[0].depth
                  : hist[0].length
                : ind.currentDepth;
            const currentVal =
              metricMode === "DEPTH"
                ? ind.currentDepth
                : metricMode === "LENGTH"
                ? ind.currentLength
                : Math.max(0, ind.currentDepth - (hist.length > 1 ? hist[0].depth : ind.currentDepth * 0.8));

            const deltaVal =
              metricMode === "DEPTH"
                ? (ind.currentDepth - (hist.length > 0 ? hist[0].depth : 0)).toFixed(1)
                : metricMode === "LENGTH"
                ? (ind.currentLength - (hist.length > 0 ? hist[0].length : 0)).toFixed(0)
                : (ind.currentDepth - (hist.length > 0 ? hist[0].depth : 0)).toFixed(1);

            const isGrowthPositive = Number(deltaVal) > 0;

            // Bar dimensions
            const barW = Math.min(22, Math.max(12, chartConfig.barGroupWidth * 0.32));
            const gap = 3;

            return (
              <g
                key={ind.code}
                className="cursor-pointer transition-opacity"
                opacity={hoveredFlawCode && !isHovered ? 0.45 : 1.0}
                onMouseEnter={() => setHoveredFlawCode(ind.code)}
                onMouseLeave={() => setHoveredFlawCode(null)}
                onClick={() => onSelectFlaw && onSelectFlaw(ind.code)}
              >
                {/* Background column highlight on hover */}
                {(isHovered || isSelected) && (
                  <rect
                    x={groupX + 2}
                    y={chartConfig.margin.top}
                    width={chartConfig.barGroupWidth - 4}
                    height={chartConfig.innerHeight}
                    fill={isSelected ? "#e0f2fe" : "#f8fafc"}
                    rx="4"
                  />
                )}

                {metricMode !== "DELTA" ? (
                  <>
                    {/* Baseline / Historical Bar */}
                    <rect
                      x={centerX - barW - gap / 2}
                      y={getY(baseVal)}
                      width={barW}
                      height={getHeight(baseVal)}
                      fill="#94a3b8"
                      rx="2"
                    />

                    {/* Current Campaign Bar */}
                    <rect
                      x={centerX + gap / 2}
                      y={getY(currentVal)}
                      width={barW}
                      height={getHeight(currentVal)}
                      fill={
                        metricMode === "DEPTH" && currentVal >= nominalWallThickness * 0.8
                          ? "#ef4444"
                          : metricMode === "DEPTH" && currentVal >= nominalWallThickness * 0.5
                          ? "#f97316"
                          : "#0284c7"
                      }
                      rx="2"
                    />

                    {/* Growth Delta Indicator Badge */}
                    {isGrowthPositive && (
                      <g>
                        <text
                          x={centerX + gap / 2 + barW / 2}
                          y={getY(currentVal) - 6}
                          textAnchor="middle"
                          fontSize="9"
                          fontWeight="bold"
                          fill={Number(deltaVal) >= 2.0 ? "#dc2626" : "#ea580c"}
                        >
                          +{deltaVal}
                        </text>
                      </g>
                    )}
                  </>
                ) : (
                  /* Delta Only Bar */
                  <>
                    <rect
                      x={centerX - barW}
                      y={getY(Number(deltaVal))}
                      width={barW * 2}
                      height={getHeight(Number(deltaVal))}
                      fill={Number(deltaVal) >= 2.0 ? "#ef4444" : "#f59e0b"}
                      rx="3"
                    />
                    <text
                      x={centerX}
                      y={getY(Number(deltaVal)) - 6}
                      textAnchor="middle"
                      fontSize="9"
                      fontWeight="bold"
                      fill="#b45309"
                    >
                      +{deltaVal}mm
                    </text>
                  </>
                )}

                {/* Flaw Sequential Number Badge & Code */}
                <circle
                  cx={centerX}
                  cy={chartConfig.height - chartConfig.margin.bottom + 14}
                  r="9"
                  fill={isSelected ? "#0284c7" : "#334155"}
                />
                <text
                  x={centerX}
                  y={chartConfig.height - chartConfig.margin.bottom + 17.5}
                  textAnchor="middle"
                  fontSize="9"
                  fontWeight="bold"
                  fill="#ffffff"
                >
                  #{idx + 1}
                </text>

                <text
                  x={centerX}
                  y={chartConfig.height - chartConfig.margin.bottom + 32}
                  textAnchor="middle"
                  fontSize="9"
                  fontWeight={isSelected ? "bold" : "normal"}
                  fill={isSelected ? "#0284c7" : "#64748b"}
                >
                  {ind.code.replace(`IND-${weldName}-`, "")}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend & Instructions */}
      <div className="flex flex-wrap items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs bg-slate-400" />
            <span>Baseline ({baselineCampaign})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs bg-sky-600" />
            <span>Current ({currentCampaign})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs bg-red-500" />
            <span>High Severity (&gt;80% Wall)</span>
          </div>
        </div>
        <span className="italic text-[11px] text-slate-400">
          Click any bar to focus predictive lifing forecast on that specific indication.
        </span>
      </div>
    </div>
  );
}
