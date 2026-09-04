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

  // Generate nice X ticks
  const xTicks = useMemo(() => {
    const span = xDomain[1] - xDomain[0];
    const step = span > 500 ? 100 : span > 200 ? 50 : span > 100 ? 20 : 10;
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
      <div className="text-center">
        <h3 className="text-sm font-bold text-amber-950 tracking-tight">
          Weld Width with Indications Plot (Index Offset vs Scan Length)
        </h3>
        <p className="text-[11px] text-slate-500">
          Top-down C-Scan plan projection relative to weld centerline (0 mm), weld cap (±3 mm), and HAZ (±6 mm)
        </p>
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

          {/* Render Defect Bounding Boxes */}
          {indications.map((pi) => {
            const startX = pi.circumferentialPosition;
            const flawLen = Math.max(6, pi.latestLength || 15);
            const x1 = scaleX(startX);
            const x2 = scaleX(startX + flawLen);
            const boxWidth = Math.max(8, x2 - x1);

            const offset = getFlawOffset(pi);
            const boxHeightMm = Math.max(1.8, Math.min(3.5, pi.latestDepth || 2.2));
            const yTop = scaleY(offset + boxHeightMm / 2);
            const yBottom = scaleY(offset - boxHeightMm / 2);
            const boxHeight = Math.max(8, yBottom - yTop);

            const isSelected = selectedFlawCode === pi.code;

            // Color matching reference image (thick green or blue borders, hollow body)
            let strokeColor = "#15803d"; // Green default
            if (pi.latestLength > 100 || pi.growthDelta > 100) strokeColor = "#15803d";
            if (pi.latestDepth > 3.0) strokeColor = "#2563eb"; // Blue
            if (pi.growthDelta > 300) strokeColor = "#dc2626"; // Red for severe

            return (
              <g
                key={pi.code}
                onClick={() => onSelectFlaw?.(pi)}
                className="cursor-pointer group"
              >
                {/* Defect Box */}
                <rect
                  x={x1}
                  y={yTop}
                  width={boxWidth}
                  height={boxHeight}
                  fill={isSelected ? `${strokeColor}25` : "#ffffff90"}
                  stroke={strokeColor}
                  strokeWidth={isSelected ? "3" : "2.2"}
                  rx="1"
                  className="transition-all hover:stroke-[3.5]"
                />
                {/* Label text inside or beside */}
                {boxWidth > 35 && (
                  <text
                    x={x1 + boxWidth / 2}
                    y={yTop + boxHeight / 2 + 3}
                    textAnchor="middle"
                    fontSize="8.5"
                    fontWeight="bold"
                    fill={strokeColor}
                  >
                    {pi.code.split("-").pop()}
                  </text>
                )}
              </g>
            );
          })}

          {/* Floating Tracking Cursor Crosshair & Measurement Halo */}
          {hoverCursor && (
            <g className="floating-cursor pointer-events-none">
              {/* Vertical Crosshair Line */}
              <line
                x1={hoverCursor.xPx}
                y1={margin.top}
                x2={hoverCursor.xPx}
                y2={margin.top + innerHeight}
                stroke="#64748b"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              {/* Horizontal Crosshair Line */}
              <line
                x1={margin.left}
                y1={hoverCursor.yPx}
                x2={margin.left + innerWidth}
                y2={hoverCursor.yPx}
                stroke="#64748b"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              {/* Crosshair Center Point */}
              <circle
                cx={hoverCursor.xPx}
                cy={hoverCursor.yPx}
                r="4"
                fill="#0284c7"
                stroke="#ffffff"
                strokeWidth="1.5"
              />
            </g>
          )}
        </svg>

        {/* Floating Tooltip Result Card */}
        {hoverCursor && (
          <div
            className="absolute pointer-events-none z-30 bg-white/95 backdrop-blur-md border border-slate-300 rounded-lg shadow-xl p-3 text-xs text-slate-800 transition-all duration-75"
            style={{
              left: `${Math.min(hoverCursor.xPx + 12, width - 230)}px`,
              top: `${Math.max(10, Math.min(hoverCursor.yPx - 30, height - 130))}px`,
              minWidth: "210px",
            }}
          >
            <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-200">
              <span className="font-bold text-slate-900">
                {hoverCursor.hoveredFlaw ? hoverCursor.hoveredFlaw.code : "Weld Location"}
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-100 text-sky-800">
                {Math.abs(hoverCursor.percentOfWeldWidth)}% to {hoverCursor.indexOffsetMm >= 0 ? "Top Toe" : "Bottom Toe"}
              </span>
            </div>

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

              {hoverCursor.hoveredFlaw && (
                <>
                  <div className="pt-1 border-t border-slate-100 flex justify-between">
                    <span className="text-slate-500">Flaw Length:</span>
                    <span className="font-bold text-slate-900">{hoverCursor.hoveredFlaw.latestLength} mm</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Flaw Depth:</span>
                    <span className="font-bold text-sky-700">{hoverCursor.hoveredFlaw.latestDepth} mm</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Annual Growth:</span>
                    <span className="font-bold text-amber-600">+{hoverCursor.hoveredFlaw.growthRateYear} mm/yr</span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Legend matching Image 1 */}
      <div className="flex flex-wrap items-center justify-between text-xs text-slate-600 pt-1">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 border-t-2 border-dashed border-emerald-500 inline-block"></span>
            <span>Centerline (0 mm)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 border-t-2 border-dashed border-purple-600 inline-block"></span>
            <span>Weld Cap / Toes (±3 mm)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 border-t-2 border-dashed border-slate-500 inline-block"></span>
            <span>HAZ Limits (±6 mm)</span>
          </span>
        </div>
        <span className="text-slate-400 italic text-[11px]">Click any indication box to inspect transverse cross-section</span>
      </div>
    </div>
  );
}
