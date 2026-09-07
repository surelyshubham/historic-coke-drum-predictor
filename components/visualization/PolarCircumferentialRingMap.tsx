"use client";

import { useState, useRef, useMemo } from "react";
import { TrackedPhysicalIndication } from "@/lib/import/matrixParser";

interface PolarCircumferentialRingMapProps {
  indications: TrackedPhysicalIndication[];
  selectedFlawCode?: string;
  onSelectFlaw?: (pi: TrackedPhysicalIndication) => void;
  drumName?: string;
  weldName?: string;
  totalCircumferenceMm?: number; // default ~28180 mm (28.2m)
  nominalWallThickness?: number; // default 32.0 mm
}

export function PolarCircumferentialRingMap({
  indications,
  selectedFlawCode,
  onSelectFlaw,
  drumName = "Coke Drum",
  weldName = "Weld Seam",
  totalCircumferenceMm = 28180,
  nominalWallThickness = 32.0,
}: PolarCircumferentialRingMapProps) {
  const [hoverPolar, setHoverPolar] = useState<{
    xPx: number;
    yPx: number;
    angleDeg: number;
    positionMm: number;
    positionMeters: number;
    percentCircumference: number;
    currentSlot: string;
    hoveredFlaw: TrackedPhysicalIndication | null;
  } | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);

  // SVG Geometry
  const size = 620;
  const center = size / 2;
  const outerRadius = 230; // OD surface (black boundary)
  const innerRadius = 188; // ID surface (green boundary)
  const wallThicknessPx = outerRadius - innerRadius; // 42 px = nominalWallThickness (32.0 mm)
  const midRadius = (outerRadius + innerRadius) / 2;
  const slotLabelRadius = 168; // Inside the inner circle

  // 28 Longitudinal Slots (L1 to L28) around the full 360° circumference
  const TOTAL_SLOTS = 28;
  const slotSpanDeg = 360 / TOTAL_SLOTS; // ~12.857 degrees per slot

  // Coordinate Conversion:
  // 0° = NORTH (top center: -90 deg or -PI/2)
  // Scan direction is ANTICLOCKWISE (counterclockwise):
  // 0° (North), 90° (West / 9 o'clock), 180° (South / 6 o'clock), 270° (East / 3 o'clock)
  const mmToAngle = (mm: number) => {
    const fraction = ((mm % totalCircumferenceMm) + totalCircumferenceMm) % totalCircumferenceMm / totalCircumferenceMm;
    const angleDeg = fraction * 360;
    // In SVG screen space: 0 deg (North) is at -PI/2.
    // Anticlockwise means decreasing angle in standard math, so:
    // angleRad = -PI/2 - (fraction * 2 * PI)
    const angleRad = -Math.PI / 2 - fraction * 2 * Math.PI;
    return { angleRad, angleDeg };
  };

  const degToAngleRad = (deg: number) => {
    return -Math.PI / 2 - (deg / 360) * 2 * Math.PI;
  };

  // Helper to create SVG arc path in anticlockwise direction
  const describeAnticlockwiseArc = (
    cx: number,
    cy: number,
    radius: number,
    startAngleRad: number,
    endAngleRad: number
  ) => {
    const startX = cx + radius * Math.cos(startAngleRad);
    const startY = cy + radius * Math.sin(startAngleRad);
    const endX = cx + radius * Math.cos(endAngleRad);
    const endY = cy + radius * Math.sin(endAngleRad);

    // Difference in clockwise direction vs anticlockwise:
    // In SVG coordinate system, y is down.
    // sweep-flag = 0 gives counter-clockwise (anticlockwise) arc!
    let diff = startAngleRad - endAngleRad;
    while (diff < 0) diff += 2 * Math.PI;
    while (diff >= 2 * Math.PI) diff -= 2 * Math.PI;
    const largeArcFlag = diff > Math.PI ? "1" : "0";

    return `M ${startX} ${startY} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${endX} ${endY}`;
  };

  // Helper to create closed annular sector patch representing depth-proportional wall penetration
  const describeAnnularSector = (
    cx: number,
    cy: number,
    rInner: number,
    rOuter: number,
    startAngleRad: number,
    endAngleRad: number
  ) => {
    // Outer arc start and end (anticlockwise)
    const x0 = cx + rOuter * Math.cos(startAngleRad);
    const y0 = cy + rOuter * Math.sin(startAngleRad);
    const x1 = cx + rOuter * Math.cos(endAngleRad);
    const y1 = cy + rOuter * Math.sin(endAngleRad);

    // Inner arc end and start (clockwise return path)
    const x2 = cx + rInner * Math.cos(endAngleRad);
    const y2 = cy + rInner * Math.sin(endAngleRad);
    const x3 = cx + rInner * Math.cos(startAngleRad);
    const y3 = cy + rInner * Math.sin(startAngleRad);

    let diff = startAngleRad - endAngleRad;
    while (diff < 0) diff += 2 * Math.PI;
    while (diff >= 2 * Math.PI) diff -= 2 * Math.PI;
    const largeArcFlag = diff > Math.PI ? "1" : "0";

    return `M ${x0} ${y0} A ${rOuter} ${rOuter} 0 ${largeArcFlag} 0 ${x1} ${y1} L ${x2} ${y2} A ${rInner} ${rInner} 0 ${largeArcFlag} 1 ${x3} ${y3} Z`;
  };

  // 28 Slots generated consecutively anticlockwise starting from North 0°
  const slots = useMemo(() => {
    return Array.from({ length: TOTAL_SLOTS }, (_, idx) => {
      const slotNum = idx + 1; // 1 to 28
      const startDeg = idx * slotSpanDeg;
      const endDeg = (idx + 1) * slotSpanDeg;
      const midDeg = (startDeg + endDeg) / 2;

      // Divider tick mark at start of each slot
      const divAngleRad = degToAngleRad(startDeg);
      const tickX1 = center + innerRadius * Math.cos(divAngleRad);
      const tickY1 = center + innerRadius * Math.sin(divAngleRad);
      const tickX2 = center + outerRadius * Math.cos(divAngleRad);
      const tickY2 = center + outerRadius * Math.sin(divAngleRad);

      // Slot label center coordinates
      const midAngleRad = degToAngleRad(midDeg);
      const labelX = center + slotLabelRadius * Math.cos(midAngleRad);
      const labelY = center + slotLabelRadius * Math.sin(midAngleRad);

      return {
        label: `L${slotNum}`,
        slotNum,
        startDeg,
        endDeg,
        midDeg,
        divAngleRad,
        tick: { tickX1, tickY1, tickX2, tickY2 },
        labelPos: { x: labelX, y: labelY },
      };
    });
  }, [center, innerRadius, outerRadius, slotLabelRadius, slotSpanDeg]);

  // Authentic Color mapping matching reference drawing:
  // Green: No crack
  // Yellow: 0.5 to 3mm
  // Orange: 3.1 to 6mm
  // Red: 6.1 to 10mm
  // Dark Red: above 10mm
  const getFlawDepthColor = (depth: number) => {
    if (depth <= 3.0) return "#eab308"; // Yellow (0.5 to 3mm)
    if (depth <= 6.0) return "#f97316"; // Orange (3.1 to 6mm)
    if (depth <= 10.0) return "#dc2626"; // Red (6.1 to 10mm)
    return "#991b1b"; // Dark Red (above 10mm)
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const dx = x - center;
    const dy = y - center;
    const distFromCenter = Math.sqrt(dx * dx + dy * dy);

    // Compute angle from top (-PI/2) in ANTICLOCKWISE direction
    // Standard Math.atan2(dy, dx) has 0 at 3 o'clock, +PI/2 at 6 o'clock (clockwise).
    // Invert angle for anticlockwise:
    let angleRadFromTop = -Math.PI / 2 - Math.atan2(dy, dx);
    while (angleRadFromTop < 0) angleRadFromTop += 2 * Math.PI;
    while (angleRadFromTop >= 2 * Math.PI) angleRadFromTop -= 2 * Math.PI;

    const fraction = angleRadFromTop / (2 * Math.PI);
    const angleDeg = Number((fraction * 360).toFixed(1));
    const positionMm = Math.round(fraction * totalCircumferenceMm);
    const positionMeters = Number((positionMm / 1000).toFixed(2));
    const percentCircumference = Number((fraction * 100).toFixed(1));

    // Determine current slot L1 - L28
    const slotIdx = Math.min(TOTAL_SLOTS - 1, Math.floor(fraction * TOTAL_SLOTS));
    const currentSlot = `L${slotIdx + 1}`;

    // Check if hovering over any flaw
    let hoveredFlaw: TrackedPhysicalIndication | null = null;
    for (const pi of indications) {
      const start = pi.circumferentialPosition;
      const end = start + Math.max(100, pi.latestLength || 500);
      const isOd = (pi.weldPosition || "").toUpperCase().includes("OD");
      const depthRatio = Math.min(1, Math.max(0.06, (pi.latestDepth || 2.5) / nominalWallThickness));
      const penetrationPx = Math.max(4, depthRatio * wallThicknessPx);
      const rInner = isOd ? outerRadius - penetrationPx : innerRadius;
      const rOuter = isOd ? outerRadius : innerRadius + penetrationPx;

      if (
        positionMm >= start &&
        positionMm <= end &&
        distFromCenter >= rInner - 8 &&
        distFromCenter <= rOuter + 8
      ) {
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
      currentSlot,
      hoveredFlaw,
    });
  };

  const handleMouseLeave = () => {
    setHoverPolar(null);
  };

  // Cardinal direction positions
  const cardinalRadius = outerRadius + 24;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
      {/* Title & Live Readout Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <span>360° Circular Circumferential Weld Map (Polar Ring View)</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-sky-100 text-sky-800 uppercase tracking-wide">
              Anticlockwise Scan • North 0°
            </span>
          </h3>
          <p className="text-[11px] text-slate-500">
            Coke Drum <strong>{drumName}</strong> ({weldName}) with 28 longitudinal slots (L1–L28) and depth-proportional indications on {nominalWallThickness.toFixed(1)} mm wall
          </p>
        </div>

        {/* Live Coordinate Readout Ribbon */}
        <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-xs">
          {hoverPolar ? (
            <>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400 font-medium">Slot:</span>
                <span className="font-mono font-extrabold text-sky-700 bg-sky-100/70 px-1.5 py-0.5 rounded">
                  {hoverPolar.currentSlot}
                </span>
              </div>
              <span className="text-slate-300">|</span>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400 font-medium">Angle θ:</span>
                <span className="font-mono font-bold text-slate-900">{hoverPolar.angleDeg}°</span>
              </div>
              <span className="text-slate-300">|</span>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400 font-medium">Pos:</span>
                <span className="font-mono font-bold text-sky-800">{hoverPolar.positionMeters} m</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-200 text-slate-700 font-semibold">
                  {hoverPolar.percentCircumference}%
                </span>
              </div>
              {hoverPolar.hoveredFlaw && (
                <>
                  <span className="text-slate-300">|</span>
                  <div className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                    <span>🎯 {hoverPolar.hoveredFlaw.code}</span>
                    <span className="font-mono text-[11px]">
                      ({hoverPolar.hoveredFlaw.latestDepth}mm / {((hoverPolar.hoveredFlaw.latestDepth / nominalWallThickness) * 100).toFixed(0)}% wall)
                    </span>
                  </div>
                </>
              )}
            </>
          ) : (
            <span className="text-slate-400 italic text-[11px] flex items-center gap-1.5">
              <span>🎯 Move cursor around the ring perimeter to inspect radial coordinates &amp; slots</span>
            </span>
          )}
        </div>
      </div>

      {/* Main SVG Display */}
      <div className="relative flex justify-center items-center py-2">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${size} ${size}`}
          className="w-full max-w-[560px] h-auto select-none cursor-crosshair overflow-visible"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {/* Outer Vessel Shell Boundary (Solid black line matching Image - OD Surface) */}
          <circle
            cx={center}
            cy={center}
            r={outerRadius}
            fill="none"
            stroke="#0f172a"
            strokeWidth="3.5"
          />

          {/* Inner Vessel Shell Boundary (Solid green wall matching Image - ID Surface) */}
          <circle
            cx={center}
            cy={center}
            r={innerRadius}
            fill="none"
            stroke="#15803d"
            strokeWidth="6"
          />

          {/* Annular Wall Region Guideline */}
          <circle
            cx={center}
            cy={center}
            r={midRadius}
            fill="none"
            stroke="#e2e8f0"
            strokeWidth="1"
            strokeDasharray="2 2"
          />

          {/* 28 Longitudinal Slot Dividers & Inner L1-L28 Slot Badges */}
          {slots.map((s) => (
            <g key={s.label}>
              {/* Slot divider line */}
              <line
                x1={s.tick.tickX1}
                y1={s.tick.tickY1}
                x2={s.tick.tickX2}
                y2={s.tick.tickY2}
                stroke="#0f172a"
                strokeWidth={s.slotNum === 1 ? "2.5" : "1.5"}
              />

              {/* Slot label inside inner circumference */}
              <text
                x={s.labelPos.x}
                y={s.labelPos.y + 4}
                textAnchor="middle"
                fontSize={s.label === "L1" || s.label === "L28" ? "12" : "10"}
                fontFamily="sans-serif"
                fontWeight={s.label === "L1" || s.label === "L28" ? "800" : "700"}
                fill={hoverPolar?.currentSlot === s.label ? "#0284c7" : "#0f172a"}
              >
                {s.label}
              </text>
            </g>
          ))}

          {/* Cardinal Directions Matching User Diagram Exactly:
              North 0° at Top
              90° at Left (West)
              180° at Bottom (South)
              270° at Right (East)
          */}
          {/* North 0° */}
          <g>
            <text
              x={center}
              y={center - cardinalRadius - 12}
              textAnchor="middle"
              fontSize="13"
              fontFamily="sans-serif"
              fontWeight="900"
              fill="#0f172a"
            >
              NORTH
            </text>
            <text
              x={center}
              y={center - cardinalRadius + 2}
              textAnchor="middle"
              fontSize="13"
              fontFamily="sans-serif"
              fontWeight="900"
              fill="#0f172a"
            >
              0°
            </text>
          </g>

          {/* 90° at Left (West / 9 o'clock) */}
          <text
            x={center - cardinalRadius - 10}
            y={center + 5}
            textAnchor="end"
            fontSize="13"
            fontFamily="sans-serif"
            fontWeight="900"
            fill="#0f172a"
          >
            90°
          </text>

          {/* 180° at Bottom (South / 6 o'clock) */}
          <text
            x={center}
            y={center + cardinalRadius + 14}
            textAnchor="middle"
            fontSize="13"
            fontFamily="sans-serif"
            fontWeight="900"
            fill="#0f172a"
          >
            180°
          </text>

          {/* 270° at Right (East / 3 o'clock) */}
          <text
            x={center + cardinalRadius + 10}
            y={center + 5}
            textAnchor="start"
            fontSize="13"
            fontFamily="sans-serif"
            fontWeight="900"
            fill="#0f172a"
          >
            270°
          </text>

          {/* Scanned Direction Curved Arrow in North-West Quadrant */}
          <g className="scanned-direction-indicator">
            <defs>
              <marker
                id="anticlockwise-arrow"
                markerWidth="7"
                markerHeight="7"
                refX="5"
                refY="3.5"
                orient="auto"
              >
                <polygon points="0 0, 7 3.5, 0 7" fill="#0f172a" />
              </marker>
            </defs>

            {/* Curved arrow path from ~350° to ~30° anticlockwise */}
            {(() => {
              const arrowRadius = outerRadius + 24;
              const startA = degToAngleRad(352);
              const endA = degToAngleRad(38);
              const pathD = describeAnticlockwiseArc(center, center, arrowRadius, startA, endA);
              return (
                <path
                  d={pathD}
                  fill="none"
                  stroke="#0f172a"
                  strokeWidth="2"
                  markerEnd="url(#anticlockwise-arrow)"
                />
              );
            })()}

            <text
              x={center - 90}
              y={center - outerRadius - 38}
              textAnchor="middle"
              fontSize="12"
              fontWeight="800"
              fontFamily="sans-serif"
              fill="#0f172a"
            >
              Scanned
            </text>
            <text
              x={center - 90}
              y={center - outerRadius - 22}
              textAnchor="middle"
              fontSize="12"
              fontWeight="800"
              fontFamily="sans-serif"
              fill="#0f172a"
            >
              Direction
            </text>
          </g>

          {/* Center Vessel Designation */}
          <text
            x={center}
            y={center - 8}
            textAnchor="middle"
            fontSize="13"
            fontWeight="bold"
            fill="#334155"
          >
            {drumName}
          </text>
          <text
            x={center}
            y={center + 12}
            textAnchor="middle"
            fontSize="11"
            fontWeight="600"
            fill="#64748b"
          >
            {weldName}
          </text>
          <text
            x={center}
            y={center + 28}
            textAnchor="middle"
            fontSize="10"
            fill="#94a3b8"
          >
            {totalCircumferenceMm ? `${(totalCircumferenceMm / 1000).toFixed(1)} m Perimeter` : ""}
          </text>

          {/* Render Indication Defect Patches Proportionally Depth-Wise along the Annular Ring */}
          {indications.map((pi) => {
            const startMm = pi.circumferentialPosition;
            const flawLen = Math.max(120, pi.latestLength || 350);
            const endMm = startMm + flawLen;

            const { angleRad: startRad } = mmToAngle(startMm);
            const { angleRad: endRad } = mmToAngle(endMm);

            const isSelected = selectedFlawCode === pi.code;
            const flawDepth = Math.max(0.5, pi.latestDepth || 2.5);
            const arcColor = getFlawDepthColor(flawDepth);

            const isOd = (pi.weldPosition || "").toUpperCase().includes("OD");
            // Proportion of nominal wall thickness
            const depthRatio = Math.min(1, Math.max(0.06, flawDepth / nominalWallThickness));
            const penetrationPx = Math.max(4, depthRatio * wallThicknessPx);

            // Annular sector radial boundaries:
            // OD initiated: penetrates from outerRadius inward
            // ID initiated: penetrates from innerRadius outward
            const rOuterPatch = isOd ? outerRadius : innerRadius + penetrationPx;
            const rInnerPatch = isOd ? outerRadius - penetrationPx : innerRadius;

            // Closed annular polygon patch
            const sectorPath = describeAnnularSector(center, center, rInnerPatch, rOuterPatch, startRad, endRad);

            return (
              <g
                key={pi.code}
                onClick={() => onSelectFlaw?.(pi)}
                className="cursor-pointer group"
              >
                {/* Depth-Proportional Annular Sector Patch */}
                <path
                  d={sectorPath}
                  fill={arcColor}
                  fillOpacity="0.88"
                  stroke={isSelected ? "#0284c7" : "#0f172a"}
                  strokeWidth={isSelected ? 2.5 : 1}
                  className="transition-all hover:fill-opacity-100 hover:brightness-105"
                />

                {/* Glow ring if selected */}
                {isSelected && (
                  <path
                    d={sectorPath}
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="3.5"
                    strokeOpacity="0.85"
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
                const rad = degToAngleRad(hoverPolar.angleDeg);
                const endX = center + (outerRadius + 14) * Math.cos(rad);
                const endY = center + (outerRadius + 14) * Math.sin(rad);
                return (
                  <line
                    x1={center}
                    y1={center}
                    x2={endX}
                    y2={endY}
                    stroke="#0284c7"
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                  />
                );
              })()}

              {/* Hollow reticle with clear center so shell wall & flaw arcs beneath are 100% visible */}
              <circle
                cx={hoverPolar.xPx}
                cy={hoverPolar.yPx}
                r="7"
                fill="none"
                stroke="#0284c7"
                strokeWidth="2"
              />
              <circle
                cx={hoverPolar.xPx}
                cy={hoverPolar.yPx}
                r="1.75"
                fill="#0284c7"
              />
            </g>
          )}
        </svg>

        {/* Docked Inspector HUD Card — Stays in opposite corner away from the cursor */}
        {hoverPolar && (
          <div
            className={`absolute pointer-events-none z-30 bg-white/95 backdrop-blur-md border border-slate-300 rounded-lg shadow-xl p-3 text-xs text-slate-800 transition-all duration-100 ${
              hoverPolar.xPx > center ? "left-3 top-3" : "right-3 top-3"
            }`}
            style={{
              minWidth: "240px",
            }}
          >
            <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-200">
              <span className="font-bold text-slate-900">
                {hoverPolar.hoveredFlaw ? hoverPolar.hoveredFlaw.code : "Vessel Perimeter"}
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-sky-100 text-sky-800">
                Slot {hoverPolar.currentSlot}
              </span>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Angle (θ):</span>
                <span className="font-mono font-bold text-slate-900">{hoverPolar.angleDeg}° (Anticlockwise)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Circumferential Pos:</span>
                <span className="font-mono font-bold text-slate-900">
                  {hoverPolar.positionMeters} m ({hoverPolar.positionMm} mm)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Perimeter %:</span>
                <span className="font-mono font-bold text-sky-700">{hoverPolar.percentCircumference}% of 360°</span>
              </div>

              {hoverPolar.hoveredFlaw && (
                <>
                  <div className="pt-1.5 border-t border-slate-100 flex justify-between">
                    <span className="text-slate-500">Flaw Length:</span>
                    <span className="font-bold text-slate-900">{hoverPolar.hoveredFlaw.latestLength} mm</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Through-Wall Depth:</span>
                    <span className="font-bold flex items-center gap-1">
                      <span
                        className="w-2.5 h-2.5 rounded-full inline-block"
                        style={{ backgroundColor: getFlawDepthColor(hoverPolar.hoveredFlaw.latestDepth) }}
                      />
                      <span>
                        {hoverPolar.hoveredFlaw.latestDepth} mm (
                        {((hoverPolar.hoveredFlaw.latestDepth / nominalWallThickness) * 100).toFixed(1)}% of wall)
                      </span>
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Initiation Surface:</span>
                    <span className="font-semibold text-slate-700">
                      {(hoverPolar.hoveredFlaw.weldPosition || "").toUpperCase().includes("OD")
                        ? "OD Surface (Outside)"
                        : "ID Surface (Inside)"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Remaining Sound Wall:</span>
                    <span className="font-mono font-bold text-emerald-700">
                      {Math.max(0, nominalWallThickness - hoverPolar.hoveredFlaw.latestDepth).toFixed(1)} mm
                    </span>
                  </div>
                  {hoverPolar.hoveredFlaw.growthRateYear > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Growth Rate:</span>
                      <span className="font-bold text-amber-600">+{hoverPolar.hoveredFlaw.growthRateYear} mm/yr</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Severity Color Legend Matching Reference Drawing Exactly */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-slate-700 pt-2 border-t border-slate-200">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-bold text-slate-900">Depth Legend:</span>

          <span className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded border border-slate-200">
            <span className="w-3.5 h-3.5 bg-green-600 rounded-xs inline-block"></span>
            <span className="font-medium">No crack</span>
          </span>

          <span className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded border border-slate-200">
            <span className="w-3.5 h-3.5 bg-yellow-500 rounded-xs inline-block"></span>
            <span className="font-medium">0.5 to 3mm</span>
          </span>

          <span className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded border border-slate-200">
            <span className="w-3.5 h-3.5 bg-orange-500 rounded-xs inline-block"></span>
            <span className="font-medium">3.1 to 6mm</span>
          </span>

          <span className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded border border-slate-200">
            <span className="w-3.5 h-3.5 bg-red-600 rounded-xs inline-block"></span>
            <span className="font-medium">6.1 to 10mm</span>
          </span>

          <span className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded border border-slate-200">
            <span className="w-3.5 h-3.5 bg-red-900 rounded-xs inline-block"></span>
            <span className="font-medium">above 10mm</span>
          </span>
        </div>

        <span className="text-slate-500 italic text-[11px]">
          Hover perimeter to track <strong>L1–L28</strong> slots &amp; anticlockwise position
        </span>
      </div>
    </div>
  );
}

