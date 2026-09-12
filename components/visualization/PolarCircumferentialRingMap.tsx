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

interface PolarDefectBadgeProps {
  surface: string;
  outerRadius: number;
  innerRadius: number;
  center: number;
  midRad: number;
  isSelected: boolean;
  isHovered: boolean;
  defectNum: number;
}

function PolarDefectBadge({
  surface,
  outerRadius,
  innerRadius,
  center,
  midRad,
  isSelected,
  isHovered,
  defectNum,
}: PolarDefectBadgeProps) {
  const isOdFlaw = surface === "OD";
  const numRadius = isOdFlaw ? outerRadius + 18 : innerRadius - 28;
  const nx = center + numRadius * Math.cos(midRad);
  const ny = center + numRadius * Math.sin(midRad);

  return (
    <g className="pointer-events-none defect-num-badge">
      <circle
        cx={nx}
        cy={ny}
        r="8.5"
        fill={isSelected || isHovered ? "#0284c7" : "#0f172a"}
        stroke="#ffffff"
        strokeWidth="1.5"
      />
      <text
        x={nx}
        y={ny + 3}
        textAnchor="middle"
        fontSize="9"
        fontWeight="900"
        fill="#ffffff"
        fontFamily="sans-serif"
      >
        #{defectNum}
      </text>
    </g>
  );
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
  const slotLabelRadius = 172; // Inside the inner circle

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

      // Divider tick mark at start of each slot (only drawn inside the clear area, not blocking the shell wall)
      const divAngleRad = degToAngleRad(startDeg);
      const tickX1 = center + (innerRadius - 15) * Math.cos(divAngleRad);
      const tickY1 = center + (innerRadius - 15) * Math.sin(divAngleRad);
      const tickX2 = center + (innerRadius - 2) * Math.cos(divAngleRad);
      const tickY2 = center + (innerRadius - 2) * Math.sin(divAngleRad);

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

  // Explicit Flaw Surface Classifier (ID vs OD vs BOTH)
  const getFlawSurface = (pi: TrackedPhysicalIndication): "ID" | "OD" | "BOTH" => {
    const hasId = typeof pi.latestDepthId === "number" && pi.latestDepthId > 0;
    const hasOd = typeof pi.latestDepthOd === "number" && pi.latestDepthOd > 0;
    if (hasId && hasOd) return "BOTH";
    if (hasId) return "ID";
    if (hasOd) return "OD";

    const text = `${pi.weldPosition || ""} ${pi.locationText || ""} ${pi.indicationType || ""}`.toUpperCase();
    if (text.includes("OD")) return "OD";
    if (text.includes("ID")) return "ID";

    return "ID";
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
      const surface = getFlawSurface(pi);
      const isOd = surface === "OD";
      const isBoth = surface === "BOTH";
      const depthRatio = Math.min(1, Math.max(0.08, (pi.latestDepth || 2.5) / nominalWallThickness));
      const penetrationPx = Math.max(4, depthRatio * wallThicknessPx);

      // Hit boundary covers both inner and outer indication bands
      const rInner = isOd ? outerRadius - penetrationPx : innerRadius - 12;
      const rOuter = isOd ? outerRadius + 12 : (isBoth ? outerRadius + 12 : innerRadius + penetrationPx);

      const wraps = end > totalCircumferenceMm;
      const inCircumference = wraps
        ? (positionMm >= start || positionMm <= (end % totalCircumferenceMm))
        : (positionMm >= start && positionMm <= end);

      if (
        inCircumference &&
        distFromCenter >= rInner - 4 &&
        distFromCenter <= rOuter + 4
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
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 border-b border-slate-100 pb-3 min-h-[130px] md:min-h-[85px]">
        <div>
          <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <span>360° Circular Circumferential Weld Map</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-sky-100 text-sky-800 uppercase tracking-wide">
              Anticlockwise Scan • North 0°
            </span>
          </h3>
          <p className="text-[11px] text-slate-500 mt-1">
            Coke Drum <strong>{drumName}</strong> ({weldName}) with 28 longitudinal slots (L1–L28) and depth-proportional indications on {nominalWallThickness.toFixed(1)} mm wall
          </p>
        </div>

        {/* Live Coordinate Readout Ribbon (Wrap allowed, parent height prevents shifting) */}
        <div className="flex flex-wrap items-center gap-2 md:gap-3 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-xs min-h-[36px]">
          {hoverPolar ? (
            <>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-slate-400 font-medium">Slot:</span>
                <span className="font-mono font-extrabold text-sky-700 bg-sky-100/70 px-1.5 py-0.5 rounded">
                  {hoverPolar.currentSlot}
                </span>
              </div>
              <span className="text-slate-300 shrink-0 hidden sm:inline">|</span>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-slate-400 font-medium">Angle θ:</span>
                <span className="font-mono font-bold text-slate-900">{hoverPolar.angleDeg}°</span>
              </div>
              <span className="text-slate-300 shrink-0">|</span>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-slate-400 font-medium">Pos:</span>
                <span className="font-mono font-bold text-sky-800">{hoverPolar.positionMeters} m</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-200 text-slate-700 font-semibold">
                  {hoverPolar.percentCircumference}%
                </span>
              </div>
              {hoverPolar.hoveredFlaw && (
                <>
                  <span className="text-slate-300 shrink-0">|</span>
                  <div className="flex items-center gap-1.5 font-semibold shrink-0">
                    <span className="text-slate-900">🎯 {hoverPolar.hoveredFlaw.code}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold ${
                      getFlawSurface(hoverPolar.hoveredFlaw) === "OD"
                        ? "bg-amber-100 text-amber-900 border border-amber-300"
                        : getFlawSurface(hoverPolar.hoveredFlaw) === "ID"
                        ? "bg-rose-100 text-rose-900 border border-rose-300"
                        : "bg-purple-100 text-purple-900 border border-purple-300"
                    }`}>
                      {getFlawSurface(hoverPolar.hoveredFlaw)}
                    </span>
                    <span className="font-mono text-[11px] text-slate-700">
                      ({hoverPolar.hoveredFlaw.latestDepth}mm)
                    </span>
                  </div>
                </>
              )}
            </>
          ) : (
            <span className="text-slate-400 italic text-[11px] flex items-center gap-1.5 shrink-0">
              <span>🎯 Move cursor around the ring perimeter to inspect radial coordinates &amp; slots</span>
            </span>
          )}
        </div>
      </div>

      {/* Main Grid: Polar Map on Left (lg:col-span-7), Defect Table on Right (lg:col-span-5) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-7 relative flex justify-center items-center py-2">
          <svg
            ref={svgRef}
            viewBox={`-20 -25 ${size + 40} ${size + 40}`}
            className="w-full max-w-[560px] h-auto select-none cursor-crosshair overflow-visible"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
          {/* Solid Light Green Annular Vessel Shell Wall ("Green: No crack" matching Client Reference Drawing - #7CFC00) */}
          <circle
            cx={center}
            cy={center}
            r={midRadius}
            fill="none"
            stroke="#7CFC00"
            strokeWidth={wallThicknessPx}
          />

          {/* Outer Vessel Shell Boundary (Solid black line matching Image - OD Surface) */}
          <circle
            cx={center}
            cy={center}
            r={outerRadius}
            fill="none"
            stroke="#0f172a"
            strokeWidth="2.5"
          />

          {/* Inner Vessel Shell Boundary (Solid black line matching Image - ID Surface) */}
          <circle
            cx={center}
            cy={center}
            r={innerRadius}
            fill="none"
            stroke="#0f172a"
            strokeWidth="2"
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

          {/* Render Indication Defect Patches Proportionally Depth-Wise strictly confined within the Annular Ring */}
          {indications.map((pi, idx) => {
            const defectNum = idx + 1;
            const startMm = pi.circumferentialPosition;
            const flawLen = Math.max(120, pi.latestLength || 350);
            const endMm = startMm + flawLen;
            const midMm = startMm + flawLen / 2;

            const { angleRad: startRad } = mmToAngle(startMm);
            const { angleRad: endRad } = mmToAngle(endMm);
            const { angleRad: midRad } = mmToAngle(midMm);

            const isSelected = selectedFlawCode === pi.code;
            const isHovered = hoverPolar?.hoveredFlaw?.code === pi.code;
            const flawDepth = Math.max(0.5, pi.latestDepth || 2.5);

            // Determine explicit surface: ID, OD, or BOTH
            const surface = getFlawSurface(pi);
            const depthId = pi.latestDepthId;
            const depthOd = pi.latestDepthOd;
            const hasId = typeof depthId === "number" && depthId > 0;
            const hasOd = typeof depthOd === "number" && depthOd > 0;

            const patches: Array<{ centerRadius: number; thickness: number; color: string; key: string }> = [];

            if (surface === "BOTH" || (hasId && hasOd)) {
              // Dual patches: ID flaw initiating at innerRadius, OD flaw initiating at outerRadius
              const effId = hasId ? depthId! : flawDepth;
              const effOd = hasOd ? depthOd! : flawDepth;

              const idRatio = Math.min(0.9, Math.max(0.08, effId / nominalWallThickness));
              const idPx = Math.max(4, idRatio * wallThicknessPx);
              patches.push({
                centerRadius: innerRadius + idPx / 2,
                thickness: idPx,
                color: getFlawDepthColor(effId),
                key: "id-patch",
              });

              const odRatio = Math.min(0.9, Math.max(0.08, effOd / nominalWallThickness));
              const odPx = Math.max(4, odRatio * wallThicknessPx);
              patches.push({
                centerRadius: outerRadius - odPx / 2,
                thickness: odPx,
                color: getFlawDepthColor(effOd),
                key: "od-patch",
              });
            } else if (surface === "OD") {
              const effDepth = hasOd ? depthOd! : flawDepth;
              const depthRatio = Math.min(0.95, Math.max(0.08, effDepth / nominalWallThickness));
              const penetrationPx = Math.max(4, depthRatio * wallThicknessPx);

              patches.push({
                centerRadius: outerRadius - penetrationPx / 2,
                thickness: penetrationPx,
                color: getFlawDepthColor(effDepth),
                key: "od-patch",
              });
            } else {
              // ID Flaw (strictly confined between innerRadius and innerRadius + penetrationPx)
              const effDepth = hasId ? depthId! : flawDepth;
              const depthRatio = Math.min(0.95, Math.max(0.08, effDepth / nominalWallThickness));
              const penetrationPx = Math.max(4, depthRatio * wallThicknessPx);

              patches.push({
                centerRadius: innerRadius + penetrationPx / 2,
                thickness: penetrationPx,
                color: getFlawDepthColor(effDepth),
                key: "id-patch",
              });
            }

            return (
              <g
                key={pi.code}
                onClick={() => onSelectFlaw?.(pi)}
                className="cursor-pointer group"
              >
                {patches.map((p) => {
                  const arcPath = describeAnticlockwiseArc(center, center, p.centerRadius, startRad, endRad);
                  
                  return (
                    <g key={p.key}>
                      {/* Highlight outline (drawn under the main arc so it acts as a glow/border) */}
                      {(isSelected || isHovered) && (
                        <path
                          d={arcPath}
                          fill="none"
                          stroke={isSelected ? "#38bdf8" : "#ffffff"}
                          strokeWidth={p.thickness + (isSelected ? 3.5 : 2)}
                          strokeOpacity="0.9"
                          strokeLinecap="round"
                        />
                      )}
                      {/* Main proportional organic crack arc strictly bounded inside wall */}
                      <path
                        d={arcPath}
                        fill="none"
                        stroke={p.color}
                        strokeOpacity="0.95"
                        strokeWidth={p.thickness}
                        strokeLinecap="round"
                        className="transition-all hover:stroke-opacity-100 hover:brightness-110"
                      />
                    </g>
                  );
                })}



                {/* Clean Numeric Badge on inner/outer side */}
                <PolarDefectBadge
                  surface={surface}
                  outerRadius={outerRadius}
                  innerRadius={innerRadius}
                  center={center}
                  midRad={midRad}
                  isSelected={isSelected}
                  isHovered={isHovered}
                  defectNum={defectNum}
                />
              </g>
            );
            })}

            {/* Hover Reticle */}
            {hoverPolar && (
              <g className="pointer-events-none">
                <line
                  x1={center + (innerRadius - 10) * Math.cos(degToAngleRad(hoverPolar.angleDeg))}
                  y1={center + (innerRadius - 10) * Math.sin(degToAngleRad(hoverPolar.angleDeg))}
                  x2={center + (outerRadius + 10) * Math.cos(degToAngleRad(hoverPolar.angleDeg))}
                  y2={center + (outerRadius + 10) * Math.sin(degToAngleRad(hoverPolar.angleDeg))}
                  stroke="#0284c7"
                  strokeWidth="1.8"
                  strokeDasharray="2 2"
                />
                <circle
                  cx={hoverPolar.xPx}
                  cy={hoverPolar.yPx}
                  r="5"
                  fill="none"
                  stroke="#0284c7"
                  strokeWidth="2"
                />
              </g>
            )}
          </svg>
        </div>

        {/* Right: Side-by-Side Defect Details Table */}
        <div className="lg:col-span-5 bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
              {weldName} Defect Log ({indications.length} Indications)
            </h4>
            <span className="text-[10px] text-slate-500 font-medium">Wall: {nominalWallThickness}mm</span>
          </div>

          <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-200/70 border-b border-slate-200 text-slate-700 font-bold text-[11px]">
                  <th className="p-2">#</th>
                  <th className="p-2">Slot</th>
                  <th className="p-2">Pos</th>
                  <th className="p-2">Sfc</th>
                  <th className="p-2">Depth</th>
                  <th className="p-2">% Wall</th>
                  <th className="p-2">Severity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {indications.map((pi, idx) => {
                  const defectNum = idx + 1;
                  const isSelected = selectedFlawCode === pi.code;
                  const isHovered = hoverPolar?.hoveredFlaw?.code === pi.code;
                  const surface = getFlawSurface(pi);
                  const effDepth = pi.latestDepth || 2.5;
                  const pct = Math.round((effDepth / nominalWallThickness) * 100);
                  const color = getFlawDepthColor(effDepth);

                  // Compute slot from position
                  const slotIndex = Math.floor((pi.circumferentialPosition / totalCircumferenceMm) * TOTAL_SLOTS) % TOTAL_SLOTS;
                  const slotName = `L${slotIndex + 1}`;

                  return (
                    <tr
                      key={pi.code}
                      onClick={() => onSelectFlaw?.(pi)}
                      onMouseEnter={() => {
                        const { angleDeg, angleRad } = mmToAngle(pi.circumferentialPosition);
                        setHoverPolar({
                          xPx: center + midRadius * Math.cos(angleRad),
                          yPx: center + midRadius * Math.sin(angleRad),
                          angleDeg: Number(angleDeg.toFixed(1)),
                          positionMm: pi.circumferentialPosition,
                          positionMeters: Number((pi.circumferentialPosition / 1000).toFixed(2)),
                          percentCircumference: Number(((pi.circumferentialPosition / totalCircumferenceMm) * 100).toFixed(1)),
                          currentSlot: slotName,
                          hoveredFlaw: pi,
                        });
                      }}
                      onMouseLeave={() => setHoverPolar(null)}
                      className={`cursor-pointer transition text-[11px] ${
                        isSelected
                          ? "bg-sky-100 font-bold text-sky-900"
                          : isHovered
                          ? "bg-sky-50 font-medium"
                          : "hover:bg-slate-100/80"
                      }`}
                    >
                      <td className="p-2 font-bold text-slate-900">#{defectNum}</td>
                      <td className="p-2 font-semibold text-slate-700">{slotName}</td>
                      <td className="p-2 font-mono text-slate-800">{pi.circumferentialPosition}mm</td>
                      <td className="p-2 font-semibold">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                          surface === "OD" ? "bg-amber-100 text-amber-900" : surface === "ID" ? "bg-rose-100 text-rose-900" : "bg-purple-100 text-purple-900"
                        }`}>
                          {surface}
                        </span>
                      </td>
                      <td className="p-2 font-mono font-bold" style={{ color }}>
                        {effDepth.toFixed(1)}mm
                      </td>
                      <td className="p-2 font-mono text-slate-700">{pct}%</td>
                      <td className="p-2">
                        <span
                          className="w-3 h-3 rounded-full inline-block border border-slate-400/40"
                          style={{ backgroundColor: color }}
                          title={`Severity color for ${effDepth}mm`}
                        />
                      </td>
                    </tr>
                  );
                })}
                {indications.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-4 text-center text-slate-400 italic">
                      No crack indications recorded (Sound Base Metal).
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Severity Color Legend Matching Reference Drawing Exactly */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-slate-700 pt-2 border-t border-slate-200">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-bold text-slate-900">Depth Legend:</span>

          <span className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded border border-slate-200">
            <span className="w-3.5 h-3.5 rounded-xs inline-block border border-slate-400/40" style={{ backgroundColor: "#7CFC00" }}></span>
            <span className="font-medium">No crack (Sound Wall)</span>
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

        <div className="flex items-center gap-3 text-[11px] font-semibold">
          <span className="flex items-center gap-1 text-amber-800">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block border border-amber-800"></span>
            Outer Ring Edge: OD Surface (External)
          </span>
          <span className="flex items-center gap-1 text-red-700">
            <span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block border border-red-900"></span>
            Inner Ring Edge: ID Surface (Internal / Clad)
          </span>
        </div>
      </div>
    </div>
  );
}

