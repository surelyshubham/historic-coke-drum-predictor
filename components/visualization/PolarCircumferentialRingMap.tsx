"use client";

import { useState, useRef } from "react";
import { TrackedPhysicalIndication } from "@/lib/import/matrixParser";

interface PolarCircumferentialRingMapProps {
  indications: TrackedPhysicalIndication[];
  selectedFlawCode?: string;
  onSelectFlaw?: (pi: TrackedPhysicalIndication) => void;
  drumName?: string;
  weldName?: string;
  totalCircumferenceMm?: number; // default ~28180 mm (28.2m)
}

export function PolarCircumferentialRingMap({
  indications,
  selectedFlawCode,
  onSelectFlaw,
  drumName = "Coke Drum",
  weldName = "Weld Seam",
  totalCircumferenceMm = 28180,
}: PolarCircumferentialRingMapProps) {
  const [hoverPolar, setHoverPolar] = useState<{
    xPx: number;
    yPx: number;
    angleDeg: number;
    positionMm: number;
    positionMeters: number;
    percentCircumference: number;
    hoveredFlaw: TrackedPhysicalIndication | null;
  } | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);

  // Geometry
  const size = 560;
  const center = size / 2;
  const outerRadius = 220;
  const innerRadius = 180;
  const midRadius = (outerRadius + innerRadius) / 2;

  // Discrete segment tick values matching Image 2 reference exactly
  // [0, 13, 27, 40, 53, 66, 80, 93, 106, 120, 133, 146]
  const segmentTicks = [
    { label: "0", mm: 0 },
    { label: "13", mm: (13 / 160) * totalCircumferenceMm },
    { label: "27", mm: (27 / 160) * totalCircumferenceMm },
    { label: "40", mm: (40 / 160) * totalCircumferenceMm },
    { label: "53", mm: (53 / 160) * totalCircumferenceMm },
    { label: "66", mm: (66 / 160) * totalCircumferenceMm },
    { label: "80", mm: (80 / 160) * totalCircumferenceMm },
    { label: "93", mm: (93 / 160) * totalCircumferenceMm },
    { label: "106", mm: (106 / 160) * totalCircumferenceMm },
    { label: "120", mm: (120 / 160) * totalCircumferenceMm },
    { label: "133", mm: (133 / 160) * totalCircumferenceMm },
    { label: "146", mm: (146 / 160) * totalCircumferenceMm },
  ];

  // Helper to convert mm to angle in radians and degrees (0 mm at top = -90 deg / -PI/2)
  const mmToAngle = (mm: number) => {
    const fraction = (mm % totalCircumferenceMm) / totalCircumferenceMm;
    const angleRad = fraction * 2 * Math.PI - Math.PI / 2;
    const angleDeg = (fraction * 360);
    return { angleRad, angleDeg };
  };

  // Helper to create SVG arc path
  const describeArc = (x: number, y: number, radius: number, startAngleRad: number, endAngleRad: number) => {
    const startX = x + radius * Math.cos(startAngleRad);
    const startY = y + radius * Math.sin(startAngleRad);
    const endX = x + radius * Math.cos(endAngleRad);
    const endY = y + radius * Math.sin(endAngleRad);
    const largeArcFlag = endAngleRad - startAngleRad <= Math.PI ? "0" : "1";

    return `M ${startX} ${startY} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endX} ${endY}`;
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const dx = x - center;
    const dy = y - center;
    const distFromCenter = Math.sqrt(dx * dx + dy * dy);

    // Calculate angle in radians: clockwise from top (-PI/2)
    let theta = Math.atan2(dy, dx) + Math.PI / 2;
    if (theta < 0) theta += 2 * Math.PI;

    const fraction = theta / (2 * Math.PI);
    const angleDeg = Number((fraction * 360).toFixed(1));
    const positionMm = Math.round(fraction * totalCircumferenceMm);
    const positionMeters = Number((positionMm / 1000).toFixed(2));
    const percentCircumference = Number((fraction * 100).toFixed(1));

    // Check if hovering over any flaw
    let hoveredFlaw: TrackedPhysicalIndication | null = null;
    for (const pi of indications) {
      const start = pi.circumferentialPosition;
      const end = start + Math.max(100, pi.latestLength || 500);
      if (positionMm >= start && positionMm <= end && distFromCenter >= innerRadius - 15 && distFromCenter <= outerRadius + 15) {
        hoveredFlaw = pi;
        break;
      }
    }

    setHoverPolar({
      xPx: x,
      yPx: y,
      angleDeg,
      positionMm,
      positionMeters,
      percentCircumference,
      hoveredFlaw,
    });
  };

  const handleMouseLeave = () => {
    setHoverPolar(null);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
      {/* Title */}
      <div className="text-center">
        <h3 className="text-sm font-bold text-slate-900 tracking-tight">
          360° Circular Circumferential Weld Map (Polar Ring View)
        </h3>
        <p className="text-[11px] text-slate-500">
          Full 360° vessel cross-section for {drumName} ({weldName}) with circumferential distance badges (0–146 units)
        </p>
      </div>

      {/* Main SVG Display */}
      <div className="relative flex justify-center items-center py-2">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${size} ${size}`}
          className="w-full max-w-[500px] h-auto select-none cursor-crosshair overflow-visible"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {/* Outer Vessel Shell Boundary (Solid black line matching Image 2) */}
          <circle
            cx={center}
            cy={center}
            r={outerRadius}
            fill="none"
            stroke="#0f172a"
            strokeWidth="2.5"
          />

          {/* Inner Vessel Shell Boundary (Solid black line matching Image 2) */}
          <circle
            cx={center}
            cy={center}
            r={innerRadius}
            fill="none"
            stroke="#0f172a"
            strokeWidth="2.5"
          />

          {/* Annular Wall Region Background with subtle radial guideline */}
          <circle
            cx={center}
            cy={center}
            r={midRadius}
            fill="none"
            stroke="#e2e8f0"
            strokeWidth="1"
            strokeDasharray="2 2"
          />

          {/* Segment Tick Marks & Numerical Badges around the Circumference */}
          {segmentTicks.map((tick) => {
            const { angleRad } = mmToAngle(tick.mm);
            const xInner = center + (outerRadius) * Math.cos(angleRad);
            const yInner = center + (outerRadius) * Math.sin(angleRad);
            const xOuter = center + (outerRadius + 12) * Math.cos(angleRad);
            const yOuter = center + (outerRadius + 12) * Math.sin(angleRad);
            const xText = center + (outerRadius + 24) * Math.cos(angleRad);
            const yText = center + (outerRadius + 24) * Math.sin(angleRad);

            return (
              <g key={tick.label}>
                {/* Radial tick line */}
                <line
                  x1={xInner}
                  y1={yInner}
                  x2={xOuter}
                  y2={yOuter}
                  stroke="#475569"
                  strokeWidth="1.5"
                />
                {/* Number label matching Image 2 font style */}
                <text
                  x={xText}
                  y={yText + 3.5}
                  textAnchor="middle"
                  fontSize="11"
                  fontFamily="sans-serif"
                  fontWeight="600"
                  fill="#1e293b"
                >
                  {tick.label}
                </text>
              </g>
            );
          })}

          {/* Center Vessel Label */}
          <text
            x={center}
            y={center - 6}
            textAnchor="middle"
            fontSize="12"
            fontWeight="bold"
            fill="#334155"
          >
            {drumName}
          </text>
          <text
            x={center}
            y={center + 12}
            textAnchor="middle"
            fontSize="10"
            fill="#64748b"
          >
            {weldName} (28.2m)
          </text>

          {/* Render Indication Defect Arcs along the Annular Ring */}
          {indications.map((pi) => {
            const startMm = pi.circumferentialPosition;
            const endMm = startMm + Math.max(80, pi.latestLength || 300);

            const { angleRad: startRad } = mmToAngle(startMm);
            let { angleRad: endRad } = mmToAngle(endMm);
            if (endRad <= startRad) endRad += 2 * Math.PI;

            const isSelected = selectedFlawCode === pi.code;

            // Arc colors matching Image 2 reference: bright green, blue, red
            let arcColor = "#16a34a"; // Green
            if (pi.latestDepth > 3.0 || pi.code.includes("000002")) arcColor = "#2563eb"; // Blue
            if (pi.growthDelta > 300 || pi.latestLength > 1500) arcColor = "#dc2626"; // Red

            const strokeW = Math.max(3.5, Math.min(8, (pi.latestDepth || 2) * 1.6));
            const arcPath = describeArc(center, center, midRadius, startRad, endRad);

            return (
              <g
                key={pi.code}
                onClick={() => onSelectFlaw?.(pi)}
                className="cursor-pointer group"
              >
                {/* Defect Arc */}
                <path
                  d={arcPath}
                  fill="none"
                  stroke={arcColor}
                  strokeWidth={isSelected ? strokeW + 4 : strokeW}
                  strokeLinecap="round"
                  className="transition-all hover:opacity-90"
                />

                {/* Glow ring if selected */}
                {isSelected && (
                  <path
                    d={arcPath}
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth={strokeW + 7}
                    strokeOpacity="0.4"
                    strokeLinecap="round"
                  />
                )}
              </g>
            );
          })}

          {/* Floating Tracking Radial Laser Line & Reticle */}
          {hoverPolar && (
            <g className="floating-polar-cursor pointer-events-none">
              {/* Radial Laser Line pointing from center outwards */}
              {(() => {
                const rad = (hoverPolar.angleDeg / 360) * 2 * Math.PI - Math.PI / 2;
                const endX = center + (outerRadius + 14) * Math.cos(rad);
                const endY = center + (outerRadius + 14) * Math.sin(rad);
                return (
                  <line
                    x1={center}
                    y1={center}
                    x2={endX}
                    y2={endY}
                    stroke="#0284c7"
                    strokeWidth="1.2"
                    strokeDasharray="3 3"
                  />
                );
              })()}

              {/* Cursor Circle */}
              <circle
                cx={hoverPolar.xPx}
                cy={hoverPolar.yPx}
                r="4.5"
                fill="#ffffff"
                stroke="#0284c7"
                strokeWidth="2"
              />
            </g>
          )}
        </svg>

        {/* Floating Tooltip Card */}
        {hoverPolar && (
          <div
            className="absolute pointer-events-none z-30 bg-white/95 backdrop-blur-md border border-slate-300 rounded-lg shadow-xl p-3 text-xs text-slate-800 transition-all duration-75"
            style={{
              left: `${Math.min(hoverPolar.xPx + 15, size - 220)}px`,
              top: `${Math.max(10, Math.min(hoverPolar.yPx - 30, size - 140))}px`,
              minWidth: "210px",
            }}
          >
            <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-200">
              <span className="font-bold text-slate-900">
                {hoverPolar.hoveredFlaw ? hoverPolar.hoveredFlaw.code : "Vessel Perimeter"}
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-100 text-sky-800">
                {hoverPolar.percentCircumference}% of 360°
              </span>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Angle (θ):</span>
                <span className="font-mono font-bold text-slate-900">{hoverPolar.angleDeg}°</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Circumferential Pos:</span>
                <span className="font-mono font-bold text-slate-900">
                  {hoverPolar.positionMeters} m ({hoverPolar.positionMm} mm)
                </span>
              </div>

              {hoverPolar.hoveredFlaw && (
                <>
                  <div className="pt-1 border-t border-slate-100 flex justify-between">
                    <span className="text-slate-500">Flaw Span:</span>
                    <span className="font-bold text-slate-900">{hoverPolar.hoveredFlaw.latestLength} mm</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Through-Wall Depth:</span>
                    <span className="font-bold text-sky-700">{hoverPolar.hoveredFlaw.latestDepth} mm</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Growth Rate:</span>
                    <span className="font-bold text-amber-600">+{hoverPolar.hoveredFlaw.growthRateYear} mm/yr</span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-between text-xs text-slate-600 pt-1 border-t border-slate-100">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-1 bg-green-600 rounded-full inline-block"></span>
            <span>Circumferential Flaw</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-1 bg-blue-600 rounded-full inline-block"></span>
            <span>Root Indication</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-1 bg-red-600 rounded-full inline-block"></span>
            <span>Severe Segment</span>
          </span>
        </div>
        <span className="text-slate-400 italic text-[11px]">Hover over perimeter to inspect angle and position</span>
      </div>
    </div>
  );
}
