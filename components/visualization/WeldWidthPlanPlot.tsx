"use client";

import { useState, useRef, useMemo } from "react";
import { TrackedPhysicalIndication } from "@/lib/import/matrixParser";

interface WeldWidthPlanPlotProps {
  indications: TrackedPhysicalIndication[];
  selectedFlawCode?: string;
  onSelectFlaw?: (pi: TrackedPhysicalIndication) => void;
  weldCapHalfWidthMm?: number; // default 3 mm (+3 to -3)
  hazHalfWidthMm?: number; // default 6 mm (+6 to -6)
}

interface MiniBevelSScanPreviewProps {
  flaw: TrackedPhysicalIndication;
  nominalWall?: number;
}

function MiniBevelSScanPreview({ flaw, nominalWall = 32.0 }: MiniBevelSScanPreviewProps) {
  const effDepth = flaw.latestDepth || 3.0;
  const depthPct = Math.min(100, Math.round((effDepth / nominalWall) * 100));
  const remainingWall = Math.max(0, nominalWall - effDepth);
  const textPos = (flaw.weldPosition || "").toUpperCase();
  const isOD = textPos.includes("OD");
  const isBT = textPos.includes("BT") || textPos.includes("BOTTOM");

  const pLeft = 25;
  const pRight = 255;
  const pTop = 22;
  const pBottom = 92;
  const pThick = pBottom - pTop;
  const wCenter = (pLeft + pRight) / 2;
  const rootY = pBottom - (11.5 / nominalWall) * pThick;

  const odTT = wCenter - (22 / 55) * ((pRight - pLeft) / 2);
  const odBT = wCenter + (22 / 55) * ((pRight - pLeft) / 2);
  const idTT = wCenter - (11 / 55) * ((pRight - pLeft) / 2);
  const idBT = wCenter + (11 / 55) * ((pRight - pLeft) / 2);

  const crackDepthPx = (Math.min(nominalWall, effDepth) / nominalWall) * pThick;
  const originX = isBT ? (isOD ? odBT : idBT) : (isOD ? odTT : idTT);
  const originY = isOD ? pTop : pBottom;
  const tipX = originX + (isBT ? -4 : 4);
  const tipY = isOD ? pTop + crackDepthPx : pBottom - crackDepthPx;

  return (
    <div className="space-y-2">
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-1.5 flex justify-center">
        <svg viewBox="0 0 280 110" className="w-full h-auto max-w-[280px]">
          <rect
            x={pLeft}
            y={pTop}
            width={pRight - pLeft}
            height={pThick}
            fill="#ffffff"
            stroke="#0f172a"
            strokeWidth="1.8"
          />
          <rect
            x={pLeft}
            y={pBottom - (3.0 / nominalWall) * pThick}
            width={pRight - pLeft}
            height={(3.0 / nominalWall) * pThick}
            fill="#38bdf8"
            fillOpacity="0.18"
            stroke="#0284c7"
            strokeWidth="0.8"
            strokeDasharray="2 2"
          />
          <polygon
            points={`${odTT},${pTop} ${odBT},${pTop} ${wCenter + 2},${rootY} ${wCenter - 2},${rootY}`}
            fill="#cbd5e1"
            stroke="#64748b"
            strokeWidth="0.8"
          />
          <polygon
            points={`${idTT},${pBottom} ${wCenter - 2},${rootY} ${wCenter + 2},${rootY} ${idBT},${pBottom}`}
            fill="#cbd5e1"
            stroke="#64748b"
            strokeWidth="0.8"
          />
          <line
            x1={wCenter}
            y1={pTop - 6}
            x2={wCenter}
            y2={pBottom + 6}
            stroke="#16a34a"
            strokeWidth="1"
            strokeDasharray="3 2"
          />
          <text x={pLeft - 4} y={pTop + 4} textAnchor="end" fontSize="8" fontWeight="800" fill="#0f172a">OD</text>
          <text x={pLeft - 4} y={pBottom} textAnchor="end" fontSize="8" fontWeight="800" fill="#0f172a">ID</text>
          <text x={odTT} y={pTop - 4} textAnchor="middle" fontSize="7.5" fontWeight="700" fill="#475569">TT</text>
          <text x={odBT} y={pTop - 4} textAnchor="middle" fontSize="7.5" fontWeight="700" fill="#475569">BT</text>
          <text x={idTT} y={pBottom + 8} textAnchor="middle" fontSize="7.5" fontWeight="700" fill="#475569">TT</text>
          <text x={idBT} y={pBottom + 8} textAnchor="middle" fontSize="7.5" fontWeight="700" fill="#475569">BT</text>
          <line
            x1={originX}
            y1={originY}
            x2={tipX}
            y2={tipY}
            stroke={isOD ? "#ea580c" : "#dc2626"}
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <circle cx={originX} cy={originY} r="2.5" fill={isOD ? "#c2410c" : "#b91c1c"} />
          <circle cx={tipX} cy={tipY} r="6" fill="#f87171" fillOpacity="0.4" />
          <circle cx={tipX} cy={tipY} r="2" fill="#991b1b" />
          <text
            x={tipX > wCenter ? tipX - 8 : tipX + 8}
            y={isOD ? tipY + 8 : tipY - 4}
            textAnchor={tipX > wCenter ? "end" : "start"}
            fontSize="8.5"
            fontWeight="bold"
            fill={isOD ? "#ea580c" : "#dc2626"}
          >
            {isOD ? "OD" : "ID"}: {effDepth.toFixed(1)}mm ({depthPct}%)
          </text>
        </svg>
      </div>

      <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-slate-100 text-[11px]">
        <div>
          <span className="text-slate-500">Scan Pos:</span>
          <span className="font-bold text-slate-900 ml-1">{flaw.circumferentialPosition} mm</span>
        </div>
        <div>
          <span className="text-slate-500">Flaw Len:</span>
          <span className="font-bold text-slate-900 ml-1">{flaw.latestLength} mm</span>
        </div>
        <div>
          <span className="text-slate-500">Depth:</span>
          <span className="font-bold text-red-600 ml-1">{effDepth.toFixed(1)} mm ({depthPct}%)</span>
        </div>
        <div>
          <span className="text-slate-500">Sound Wall:</span>
          <span className="font-bold text-emerald-700 ml-1">{remainingWall.toFixed(1)} mm</span>
        </div>
      </div>
    </div>
  );
}

export function WeldWidthPlanPlot({
  indications,
  selectedFlawCode,
  onSelectFlaw,
  weldCapHalfWidthMm = 3,
  hazHalfWidthMm = 6,
}: WeldWidthPlanPlotProps) {
  const [zoomRange, setZoomRange] = useState<[number, number] | null>(null);
  const [hoverCursor, setHoverCursor] = useState<{
    xPx: number;
    yPx: number;
    scanLengthMm: number;
    indexOffsetMm: number;
    percentOfWeldWidth: number;
    hoveredFlaw: TrackedPhysicalIndication | null;
  } | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);

  // SVG viewport geometry
  const width = 860;
  const height = 340;
  const margin = { top: 40, right: 35, bottom: 55, left: 65 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  // Compute X domain (ScanLength)
  const xDomain = useMemo(() => {
    if (zoomRange) return zoomRange;
    if (indications.length === 0) return [0, 200];
    const starts = indications.map((i) => i.circumferentialPosition);
    const ends = indications.map((i) => i.circumferentialPosition + (i.latestLength || 20));
    const minX = Math.max(0, Math.min(...starts) - 20);
    const maxX = Math.max(minX + 100, Math.max(...ends) + 20);
    return [Math.floor(minX / 10) * 10, Math.ceil(maxX / 10) * 10];
  }, [indications, zoomRange]);

  // Y domain (Index Offset mm): fixed symmetric around 0 mm (e.g. -12 to +12 mm)
  const yMin = -12;
  const yMax = 12;

  const scaleX = (val: number) => {
    const span = xDomain[1] - xDomain[0] || 1;
    return margin.left + ((val - xDomain[0]) / span) * innerWidth;
  };

  const scaleY = (val: number) => {
    const span = yMax - yMin;
    return margin.top + innerHeight - ((val - yMin) / span) * innerHeight;
  };

  const invertX = (xPx: number) => {
    const ratio = (xPx - margin.left) / innerWidth;
    return xDomain[0] + ratio * (xDomain[1] - xDomain[0]);
  };

  const invertY = (yPx: number) => {
    const ratio = (margin.top + innerHeight - yPx) / innerHeight;
    return yMin + ratio * (yMax - yMin);
  };

  // Convert indication text position (e.g. "30MM BT" or default) to index offset mm
  const getFlawOffset = (pi: TrackedPhysicalIndication) => {
    const text = (pi.weldPosition || "").toUpperCase();
    if (text.includes("BT") || text.includes("BOTTOM")) return -4.5;
    if (text.includes("TT") || text.includes("TOP")) return 3.5;
    if (text.includes("CL") || text.includes("CENTER")) return 0.0;
    // Alternate deterministic offsets for visual distinction
    const hash = Math.abs(pi.code.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0));
    const offsets = [-0.8, -4.5, 0.5, -1.2, 3.2, -0.5];
    return offsets[hash % offsets.length];
  };

  // Authentic Depth Severity Grading matching client reference standard:
  // 0.5 - 3.0 mm: Yellow
  // 3.1 - 6.0 mm: Orange
  // 6.1 - 10.0 mm: Red
  // > 10.0 mm: Dark Red / Maroon
  const getDepthGrade = (depth: number) => {
    if (depth <= 3.0) {
      return {
        fillColor: "#eab308",
        gradientId: "url(#indication-yellow)",
        strokeColor: "#ca8a04",
        darkColor: "#854d0e",
        textColor: "#713f12",
        badgeBg: "#fef9c3",
        label: "0.5 – 3.0 mm",
      };
    } else if (depth <= 6.0) {
      return {
        fillColor: "#f97316",
        gradientId: "url(#indication-orange)",
        strokeColor: "#ea580c",
        darkColor: "#9a3412",
        textColor: "#9a3412",
        badgeBg: "#ffedd5",
        label: "3.1 – 6.0 mm",
      };
    } else if (depth <= 10.0) {
      return {
        fillColor: "#dc2626",
        gradientId: "url(#indication-red)",
        strokeColor: "#b91c1c",
        darkColor: "#7f1d1d",
        textColor: "#991b1b",
        badgeBg: "#fee2e2",
        label: "6.1 – 10.0 mm",
      };
    } else {
      return {
        fillColor: "#991b1b",
        gradientId: "url(#indication-darkred)",
        strokeColor: "#7f1d1d",
        darkColor: "#450a0a",
        textColor: "#450a0a",
        badgeBg: "#fecaca",
        label: "> 10.0 mm",
      };
    }
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const xPx = e.clientX - rect.left;
    const yPx = e.clientY - rect.top;

    if (
      xPx < margin.left ||
      xPx > width - margin.right ||
      yPx < margin.top ||
      yPx > height - margin.bottom
    ) {
      setHoverCursor(null);
      return;
    }

    const scanLengthMm = Number(invertX(xPx).toFixed(1));
    const indexOffsetMm = Number(invertY(yPx).toFixed(1));
    const percentOfWeldWidth = Number(((indexOffsetMm / hazHalfWidthMm) * 100).toFixed(1));

    // Find if hovering directly on an indication
    let hoveredFlaw: TrackedPhysicalIndication | null = null;
    for (const pi of indications) {
      const startX = pi.circumferentialPosition;
      const endX = startX + Math.max(8, pi.latestLength || 15);
      const offset = getFlawOffset(pi);
      const offsetMin = offset - 1.5;
      const offsetMax = offset + 1.5;

      if (
        scanLengthMm >= startX &&
        scanLengthMm <= endX &&
        indexOffsetMm >= offsetMin &&
        indexOffsetMm <= offsetMax
      ) {
        hoveredFlaw = pi;
        break;
      }
    }

    setHoverCursor({
      xPx,
      yPx,
      scanLengthMm,
      indexOffsetMm,
      percentOfWeldWidth,
      hoveredFlaw,
    });
  };

  const handleMouseLeave = () => {
    setHoverCursor(null);
  };

  // Generate nice, non-overlapping X ticks (targeting ~8 clean ticks)
  const xTicks = useMemo(() => {
    const span = xDomain[1] - xDomain[0];
    if (span <= 0) return [xDomain[0]];
    const targetTicks = 8;
    const rawStep = span / targetTicks;
    const standardSteps = [5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
    const step = standardSteps.find((s) => s >= rawStep) || Math.ceil(rawStep / 1000) * 1000;
    const ticks: number[] = [];
    const start = Math.ceil(xDomain[0] / step) * step;
    for (let t = start; t <= xDomain[1]; t += step) {
      ticks.push(t);
    }
    return ticks;
  }, [xDomain]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
      {/* Title matching engineering standard */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3">
        <div>
          <h3 className="text-sm font-bold text-amber-950 tracking-tight">
            Weld Width with Indications Plot (Index Offset vs Scan Length)
          </h3>
          <p className="text-[11px] text-slate-500">
            Top-down C-Scan plan projection relative to weld centerline (0 mm), weld cap (±3 mm), and HAZ (±6 mm)
          </p>
        </div>

        {/* Live Coordinate Readout HUD Ribbon (Always unobscured above the plot) */}
        <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-xs h-9 min-h-[36px] max-h-[36px] overflow-hidden whitespace-nowrap">
          {hoverCursor ? (
            <>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-slate-400 font-medium">Scan:</span>
                <span className="font-mono font-bold text-slate-900">{hoverCursor.scanLengthMm} mm</span>
              </div>
              <span className="text-slate-300 shrink-0">|</span>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-slate-400 font-medium">Offset:</span>
                <span className="font-mono font-bold text-sky-700">
                  {hoverCursor.indexOffsetMm > 0 ? `+${hoverCursor.indexOffsetMm}` : hoverCursor.indexOffsetMm} mm
                </span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-sky-100 text-sky-800 font-semibold">
                  {Math.abs(hoverCursor.percentOfWeldWidth)}% to {hoverCursor.indexOffsetMm >= 0 ? "Top" : "Bottom"} Toe
                </span>
              </div>
              {hoverCursor.hoveredFlaw && (
                <>
                  <span className="text-slate-300 shrink-0">|</span>
                  <div className="flex items-center gap-1.5 text-emerald-700 font-semibold shrink-0">
                    <span>🎯 {hoverCursor.hoveredFlaw.code}</span>
                    <span className="font-mono text-[11px]">({hoverCursor.hoveredFlaw.latestLength}mm)</span>
                  </div>
                </>
              )}
            </>
          ) : (
            <span className="text-slate-400 italic text-[11px] flex items-center gap-1.5 shrink-0">
              <span>🎯 Move cursor across weld to inspect coordinates and defect geometry</span>
            </span>
          )}
        </div>
      </div>

      {/* SVG Canvas with Floating Crosshair */}
      <div className="relative border border-slate-300 rounded-lg overflow-hidden bg-[#f4f8fb] shadow-inner">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto select-none cursor-crosshair"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <defs>
            {/* Authentic Defect Depth Gradients matching client standard */}
            {/* 0.5 - 3.0 mm: Yellow */}
            <linearGradient id="indication-yellow" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#fef08a" />
              <stop offset="45%" stopColor="#facc15" />
              <stop offset="100%" stopColor="#eab308" />
            </linearGradient>

            {/* 3.1 - 6.0 mm: Orange */}
            <linearGradient id="indication-orange" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#fed7aa" />
              <stop offset="45%" stopColor="#fb923c" />
              <stop offset="100%" stopColor="#f97316" />
            </linearGradient>

            {/* 6.1 - 10.0 mm: Red */}
            <linearGradient id="indication-red" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#fca5a5" />
              <stop offset="45%" stopColor="#f87171" />
              <stop offset="100%" stopColor="#dc2626" />
            </linearGradient>

            {/* > 10.0 mm: Dark Red / Maroon */}
            <linearGradient id="indication-darkred" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#f87171" />
              <stop offset="45%" stopColor="#dc2626" />
              <stop offset="100%" stopColor="#991b1b" />
            </linearGradient>
          </defs>

          {/* Main Plot Area Background */}
          <rect
            x={margin.left}
            y={margin.top}
            width={innerWidth}
            height={innerHeight}
            fill="#f8fafc"
            stroke="#94a3b8"
            strokeWidth="1.5"
          />

          {/* Reference Lines across Weld Width */}
          {/* HAZ / Prep Boundaries (+6 mm and -6 mm) */}
          <line
            x1={margin.left}
            y1={scaleY(hazHalfWidthMm)}
            x2={margin.left + innerWidth}
            y2={scaleY(hazHalfWidthMm)}
            stroke="#64748b"
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />
          <line
            x1={margin.left}
            y1={scaleY(-hazHalfWidthMm)}
            x2={margin.left + innerWidth}
            y2={scaleY(-hazHalfWidthMm)}
            stroke="#64748b"
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />

          {/* Weld Cap / Toes Boundaries (+3 mm and -3 mm) */}
          <line
            x1={margin.left}
            y1={scaleY(weldCapHalfWidthMm)}
            x2={margin.left + innerWidth}
            y2={scaleY(weldCapHalfWidthMm)}
            stroke="#7e22ce"
            strokeWidth="1.75"
            strokeDasharray="5 3"
          />
          <line
            x1={margin.left}
            y1={scaleY(-weldCapHalfWidthMm)}
            x2={margin.left + innerWidth}
            y2={scaleY(-weldCapHalfWidthMm)}
            stroke="#7e22ce"
            strokeWidth="1.75"
            strokeDasharray="5 3"
          />

          {/* Weld Centerline (0 mm) */}
          <line
            x1={margin.left}
            y1={scaleY(0)}
            x2={margin.left + innerWidth}
            y2={scaleY(0)}
            stroke="#22c55e"
            strokeWidth="1.75"
            strokeDasharray="8 3 2 3"
          />

          {/* Y-Axis Ticks & Labels */}
          {[-10, -5, 0, 5, 10].map((val) => {
            const y = scaleY(val);
            return (
              <g key={val}>
                <line
                  x1={margin.left - 5}
                  y1={y}
                  x2={margin.left}
                  y2={y}
                  stroke="#334155"
                  strokeWidth="1"
                />
                <text
                  x={margin.left - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  fontSize="10"
                  fontFamily="sans-serif"
                  fill="#1e293b"
                  fontWeight="600"
                >
                  {val}
                </text>
              </g>
            );
          })}

          {/* X-Axis Ticks & Labels */}
          {xTicks.map((val) => {
            const x = scaleX(val);
            return (
              <g key={val}>
                <line
                  x1={x}
                  y1={margin.top + innerHeight}
                  x2={x}
                  y2={margin.top + innerHeight + 6}
                  stroke="#334155"
                  strokeWidth="1.2"
                />
                <text
                  x={x}
                  y={margin.top + innerHeight + 18}
                  textAnchor="middle"
                  fontSize="10"
                  fill="#1e293b"
                  fontWeight="600"
                >
                  {val}
                </text>
              </g>
            );
          })}

          {/* Axis Titles */}
          <text
            x={margin.left + innerWidth / 2}
            y={height - 12}
            textAnchor="middle"
            fontSize="11"
            fontWeight="bold"
            fill="#0f172a"
          >
            ScanLength (mm)
          </text>

          <text
            x={-(margin.top + innerHeight / 2)}
            y={18}
            textAnchor="middle"
            transform="rotate(-90)"
            fontSize="11"
            fontWeight="bold"
            fill="#0f172a"
          >
            Index Offset (mm)
          </text>

          {/* Render Defect Indications as Authentic Solid-Filled Depth-Coded Marks with Defect Numbering */}
          {indications.map((pi, idx) => {
            const defectNum = idx + 1;
            const startX = pi.circumferentialPosition;
            const flawLen = Math.max(6, pi.latestLength || 15);
            const x1 = scaleX(startX);
            const x2 = scaleX(startX + flawLen);
            const boxWidth = Math.max(12, x2 - x1);
            const offset = getFlawOffset(pi);
            const yCenter = scaleY(offset);

            const isSelected = selectedFlawCode === pi.code;
            const isHovered = hoverCursor?.hoveredFlaw?.code === pi.code;
            const effectiveDepth = Math.max(
              pi.latestDepth || 0,
              pi.latestDepthId || 0,
              pi.latestDepthOd || 0
            ) || 2.5;

            const depthGrade = getDepthGrade(effectiveDepth);
            const streakThickness = Math.max(7, Math.min(13, (effectiveDepth / 12) * 8 + 6));
            const yTop = yCenter - streakThickness / 2;
            const rx = streakThickness / 2;
            const flawCodeLabel = pi.code.split("-").pop() || pi.code;
            const midX = (x1 + x2) / 2;

            return (
              <g
                key={pi.code}
                onClick={() => onSelectFlaw?.(pi)}
                className="cursor-pointer group"
              >
                {/* Indication Selection / Hover Glow Backing */}
                {(isSelected || isHovered) && (
                  <rect
                    x={x1 - 3}
                    y={yTop - 3}
                    width={boxWidth + 6}
                    height={streakThickness + 6}
                    rx={rx + 3}
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="2.5"
                    className="animate-pulse"
                  />
                )}

                {/* Main 100% SOLID FILLED Indication Mark (Solid Depth-Severity Color Fill) */}
                <rect
                  x={x1}
                  y={yTop}
                  width={boxWidth}
                  height={streakThickness}
                  rx={rx}
                  fill={depthGrade.fillColor}
                  fillOpacity="1"
                  stroke={depthGrade.strokeColor}
                  strokeWidth="1.8"
                  className="transition-all hover:brightness-110 shadow-sm"
                />

                {/* Clean Defect Number Label on top/bottom */}
                <g className="pointer-events-none">
                  <text
                    x={midX}
                    y={offset >= 0 ? yTop - 4 : yTop + streakThickness + 11}
                    textAnchor="middle"
                    fontSize="10"
                    fontWeight="800"
                    fill="#ffffff"
                    stroke="#ffffff"
                    strokeWidth="3.5"
                    fontFamily="sans-serif"
                  >
                    #{defectNum}
                  </text>
                  <text
                    x={midX}
                    y={offset >= 0 ? yTop - 4 : yTop + streakThickness + 11}
                    textAnchor="middle"
                    fontSize="10"
                    fontWeight="800"
                    fill={depthGrade.darkColor}
                    fontFamily="sans-serif"
                  >
                    #{defectNum}
                  </text>
                </g>
              </g>
            );
          })}

          {/* Crisp, Fully Enclosed Bounding Box Frame */}
          <rect
            x={margin.left}
            y={margin.top}
            width={innerWidth}
            height={innerHeight}
            fill="none"
            stroke="#475569"
            strokeWidth="1.8"
          />

          {/* Floating Tracking Crosshair & Reticle */}
          {hoverCursor && (
            <g className="floating-cursor pointer-events-none">
              <line
                x1={hoverCursor.xPx}
                y1={margin.top}
                x2={hoverCursor.xPx}
                y2={margin.top + innerHeight}
                stroke="#64748b"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              <line
                x1={margin.left}
                y1={hoverCursor.yPx}
                x2={margin.left + innerWidth}
                y2={hoverCursor.yPx}
                stroke="#64748b"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              {/* Hollow reticle with clear center so data points beneath are 100% visible */}
              <circle
                cx={hoverCursor.xPx}
                cy={hoverCursor.yPx}
                r="6"
                fill="none"
                stroke="#0284c7"
                strokeWidth="1.75"
              />
              <circle
                cx={hoverCursor.xPx}
                cy={hoverCursor.yPx}
                r="1.5"
                fill="#0284c7"
              />
            </g>
          )}
        </svg>

        {/* Floating Inspector Card with Interactive Double-V Cross-Section Bevel Preview */}
        {hoverCursor && (
          <div
            className={`absolute pointer-events-none z-30 bg-white/95 backdrop-blur-md border border-slate-300 rounded-xl shadow-2xl p-3 text-xs text-slate-800 transition-all duration-100 ${
              hoverCursor.xPx > width / 2 ? "left-4 top-4" : "right-4 top-4"
            }`}
            style={{
              minWidth: hoverCursor.hoveredFlaw ? "310px" : "220px",
              maxWidth: "340px",
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-slate-200">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-900">
                  {hoverCursor.hoveredFlaw
                    ? `Defect #${indications.findIndex((i) => i.code === hoverCursor.hoveredFlaw?.code) + 1} (${hoverCursor.hoveredFlaw.code})`
                    : "Weld Coordinates"}
                </span>
              </div>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-800">
                {Math.abs(hoverCursor.percentOfWeldWidth)}% to {hoverCursor.indexOffsetMm >= 0 ? "Top Toe (TT)" : "Bottom Toe (BT)"}
              </span>
            </div>

            {/* If Hovering over an Indication: Render Live Double-V S-Scan Profile Cross-Section */}
            {hoverCursor.hoveredFlaw ? (
              <MiniBevelSScanPreview flaw={hoverCursor.hoveredFlaw} nominalWall={32.0} />
            ) : (
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">ScanLength:</span>
                  <span className="font-mono font-bold text-slate-900">{hoverCursor.scanLengthMm} mm</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Index Offset:</span>
                  <span className={`font-mono font-bold ${hoverCursor.indexOffsetMm === 0 ? "text-emerald-600" : "text-slate-900"}`}>
                    {hoverCursor.indexOffsetMm > 0 ? `+${hoverCursor.indexOffsetMm}` : hoverCursor.indexOffsetMm} mm
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 italic pt-1">
                  Hover directly over any colored flaw streak to view its through-thickness Double-V cross-section
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Side-by-Side Defect Details Table for Plan View */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-3.5 space-y-2">
        <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
          <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-sky-600"></span>
            Weld Indication Log ({indications.length} Indications)
          </h4>
          <span className="text-[10px] text-slate-500 font-medium">Top-down C-Scan View</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-200/70 border-b border-slate-200 text-slate-700 font-bold text-[11px]">
                <th className="p-2">#</th>
                <th className="p-2">Flaw Code</th>
                <th className="p-2">Scan Pos</th>
                <th className="p-2">Length</th>
                <th className="p-2">Offset</th>
                <th className="p-2">Depth</th>
                <th className="p-2">% Wall</th>
                <th className="p-2">Severity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {indications.map((pi, idx) => {
                const defectNum = idx + 1;
                const isSelected = selectedFlawCode === pi.code;
                const isHovered = hoverCursor?.hoveredFlaw?.code === pi.code;
                const effDepth = pi.latestDepth || 2.5;
                const pct = Math.round((effDepth / 32.0) * 100);
                const depthGrade = getDepthGrade(effDepth);
                const offset = getFlawOffset(pi);

                return (
                  <tr
                    key={pi.code}
                    onClick={() => onSelectFlaw?.(pi)}
                    onMouseEnter={() => {
                      const startX = pi.circumferentialPosition;
                      const xPx = scaleX(startX + (pi.latestLength || 20) / 2);
                      const yPx = scaleY(offset);
                      setHoverCursor({
                        xPx,
                        yPx,
                        scanLengthMm: startX,
                        indexOffsetMm: offset,
                        percentOfWeldWidth: Number(((offset / hazHalfWidthMm) * 100).toFixed(1)),
                        hoveredFlaw: pi,
                      });
                    }}
                    onMouseLeave={() => setHoverCursor(null)}
                    className={`cursor-pointer transition text-[11px] ${
                      isSelected
                        ? "bg-sky-100 font-bold text-sky-900"
                        : isHovered
                        ? "bg-sky-50 font-medium"
                        : "hover:bg-slate-100/80"
                    }`}
                  >
                    <td className="p-2 font-bold text-slate-900">#{defectNum}</td>
                    <td className="p-2 font-mono font-bold text-slate-800">{pi.code}</td>
                    <td className="p-2 font-mono text-slate-700">{pi.circumferentialPosition} mm</td>
                    <td className="p-2 font-mono text-slate-700">{pi.latestLength || 15} mm</td>
                    <td className="p-2 font-mono text-slate-700">
                      {offset > 0 ? `+${offset}` : offset} mm
                    </td>
                    <td className="p-2 font-mono font-bold" style={{ color: depthGrade.fillColor }}>
                      {effDepth.toFixed(1)} mm
                    </td>
                    <td className="p-2 font-mono text-slate-700">{pct}%</td>
                    <td className="p-2">
                      <span
                        className="px-2 py-0.5 rounded text-[10px] font-bold border inline-block"
                        style={{
                          backgroundColor: depthGrade.badgeBg,
                          color: depthGrade.textColor,
                          borderColor: depthGrade.fillColor,
                        }}
                      >
                        {depthGrade.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {indications.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-4 text-center text-slate-400 italic">
                    No crack indications detected in this weld seam.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Depth Severity Color Scale & Weld Guidelines Legend */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 text-xs text-slate-600 pt-2 border-t border-slate-100">
        {/* Depth Severity Color Scale */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Depth Severity:</span>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-yellow-50 border border-yellow-300 text-yellow-900 font-semibold text-[11px]">
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 border border-yellow-600 inline-block"></span>
            <span>0.5 – 3.0 mm</span>
          </span>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-orange-50 border border-orange-300 text-orange-900 font-semibold text-[11px]">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-500 border border-orange-700 inline-block"></span>
            <span>3.1 – 6.0 mm</span>
          </span>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-red-50 border border-red-300 text-red-900 font-semibold text-[11px]">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 border border-red-700 inline-block"></span>
            <span>6.1 – 10.0 mm</span>
          </span>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-rose-100 border border-rose-400 text-rose-950 font-bold text-[11px]">
            <span className="w-2.5 h-2.5 rounded-full bg-red-800 border border-red-950 inline-block"></span>
            <span>&gt; 10.0 mm</span>
          </span>
        </div>

        {/* Weld Guidelines */}
        <div className="flex flex-wrap items-center gap-3 text-[11px]">
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 border-t-2 border-dashed border-emerald-500 inline-block"></span>
            <span>Centerline (0 mm)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 border-t-2 border-dashed border-purple-600 inline-block"></span>
            <span>Weld Cap (±3 mm)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 border-t-2 border-dashed border-slate-500 inline-block"></span>
            <span>HAZ (±6 mm)</span>
          </span>
        </div>
      </div>
    </div>
  );
}
