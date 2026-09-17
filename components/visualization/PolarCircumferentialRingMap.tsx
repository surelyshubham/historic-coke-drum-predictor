"use client";

import { useState, useRef, useMemo, useEffect } from "react";
import { TrackedPhysicalIndication } from "@/lib/import/matrixParser";
import { RepairZone } from "@/types/repair";
import {
  ColorScaleConfig,
  getFlawDepthColor as resolveFlawColor,
  getStoredColorScale,
} from "@/lib/colors/colorScales";

interface PolarCircumferentialRingMapProps {
  indications: TrackedPhysicalIndication[];
  selectedFlawCode?: string;
  onSelectFlaw?: (pi: TrackedPhysicalIndication) => void;
  drumName?: string;
  weldName?: string;
  totalCircumferenceMm?: number; // default ~28180 mm (28.2m)
  nominalWallThickness?: number; // default 32.0 mm
  cladThickness?: number; // default 3.0 mm
  jointDegrees?: number; // default 60.0 degrees (total groove angle)
  repairZones?: RepairZone[];
  layoutMode?: "SPLIT" | "CANVAS_ONLY" | "TABLE_ONLY";
  colorScale?: ColorScaleConfig;
  clientId?: number;
  drumId?: number;
}

interface PolarDefectBadgeProps {
  surface: string;
  outerRadius: number;
  innerRadius: number;
  center: number;
  origMidRad: number;
  badgeX: number;
  badgeY: number;
  isSelected: boolean;
  isHovered: boolean;
  defectNum: number;
}

function PolarDefectBadge({
  surface,
  outerRadius,
  innerRadius,
  center,
  origMidRad,
  badgeX,
  badgeY,
  isSelected,
  isHovered,
  defectNum,
}: PolarDefectBadgeProps) {
  const isOdFlaw = surface === "OD";
  // Large readable badges: single digit r=12, double digit r=14
  const badgeRadius = defectNum >= 10 ? 14 : 12;
  const origSurfX = center + (isOdFlaw ? outerRadius + 2 : innerRadius - 2) * Math.cos(origMidRad);
  const origSurfY = center + (isOdFlaw ? outerRadius + 2 : innerRadius - 2) * Math.sin(origMidRad);

  return (
    <g className="pointer-events-none defect-num-badge">
      {/* Subtle dashed leader line connecting the ring flaw location directly to the badge */}
      <line
        x1={origSurfX}
        y1={origSurfY}
        x2={badgeX}
        y2={badgeY}
        stroke={isSelected || isHovered ? "#0284c7" : "#475569"}
        strokeWidth={isSelected || isHovered ? "2" : "1.3"}
        strokeDasharray="2.5 2"
        opacity={isSelected || isHovered ? "1" : "0.75"}
      />
      {/* Outer contrast drop circle */}
      <circle
        cx={badgeX}
        cy={badgeY}
        r={badgeRadius + 1.5}
        fill="#ffffff"
      />
      {/* Main bold badge disc */}
      <circle
        cx={badgeX}
        cy={badgeY}
        r={badgeRadius}
        fill={isSelected || isHovered ? "#0284c7" : "#0f172a"}
        stroke="#ffffff"
        strokeWidth="2"
      />
      {/* High-visibility bold defect number */}
      <text
        x={badgeX}
        y={badgeY}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={defectNum >= 10 ? "11" : "12"}
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
  cladThickness = 3.0,
  jointDegrees = 60.0,
  repairZones = [],
  layoutMode = "SPLIT",
  colorScale,
  clientId,
  drumId,
}: PolarCircumferentialRingMapProps) {
  const [activeColorScale, setActiveColorScale] = useState<ColorScaleConfig>(() =>
    colorScale || getStoredColorScale(clientId, drumId)
  );

  useEffect(() => {
    if (colorScale) {
      setActiveColorScale(colorScale);
      return;
    }
    const update = () => {
      setActiveColorScale(getStoredColorScale(clientId, drumId));
    };
    update();
    window.addEventListener("paut-color-scale-updated", update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener("paut-color-scale-updated", update);
      window.removeEventListener("storage", update);
    };
  }, [colorScale, clientId, drumId]);

  const [hoverPolar, setHoverPolar] = useState<{
    xPx: number;
    yPx: number;
    angleDeg: number;
    positionMm: number;
    positionMeters: number;
    percentCircumference: number;
    currentSlot: string;
    hoveredFlaw: TrackedPhysicalIndication | null;
    activeRepairZone: RepairZone | null;
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

  // Clad Layer & Bevel Root Geometry
  const effClad = Math.max(0, cladThickness ?? 3.0);
  const cladRadius = innerRadius + (effClad / nominalWallThickness) * wallThicknessPx;
  const rootDepthMm = Number((11.5 * (nominalWallThickness / 32.0)).toFixed(1));
  const rootRadius = innerRadius + (rootDepthMm / nominalWallThickness) * wallThicknessPx;

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

  // Dynamic Color mapping resolved from active configurable color scale
  const getFlawDepthColor = (depth: number) => {
    return resolveFlawColor(depth, activeColorScale);
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

  // Smart dynamic non-overlapping badge layout computation
  const smartBadgeLayouts = useMemo(() => {
    const MIN_DIST = 34; // Minimum distance in px between badge centers
    const cardinalRadius = outerRadius + 24;

    const obstacles = [
      { x: center, y: center - cardinalRadius - 6, r: 26 }, // North 0°
      { x: center - cardinalRadius - 12, y: center + 5, r: 24 }, // 90°
      { x: center, y: center + cardinalRadius + 18, r: 24 }, // 180°
      { x: center + cardinalRadius + 12, y: center + 5, r: 24 }, // 270°
      { x: center - 135, y: -18, r: 42 }, // Far-upwards Scanned Direction Pill
    ];

    // OD Tiers: step outwards / upwards away from outer wall
    const odTiers = [
      outerRadius + 24, // Tier 0: 254px
      outerRadius + 58, // Tier 1: 288px
      outerRadius + 92, // Tier 2: 322px
      outerRadius + 124, // Tier 3: 354px
    ];

    // ID Tiers: step inwards / downwards into center cavity
    const idTiers = [
      innerRadius - 38, // Tier 0: 150px
      innerRadius - 72, // Tier 1: 116px
      innerRadius - 104, // Tier 2: 84px
    ];

    const angleOffsetsDeg = [0, 3, -3, 6, -6, 9, -9, 12, -12];

    function getCandidateOptions(isOd: boolean) {
      const tiers = isOd ? odTiers : idTiers;
      const list: Array<{ radius: number; offsetDeg: number; tier: number; cost: number }> = [];
      for (let t = 0; t < tiers.length; t++) {
        for (let a = 0; a < angleOffsetsDeg.length; a++) {
          const offsetDeg = angleOffsetsDeg[a];
          // Cost balances radial jump vs angle offset
          const cost = t * 1.8 + Math.abs(offsetDeg) * 0.35;
          list.push({ radius: tiers[t], offsetDeg, tier: t, cost });
        }
      }
      list.sort((a, b) => a.cost - b.cost);
      return list;
    }

    const odCandidates = getCandidateOptions(true);
    const idCandidates = getCandidateOptions(false);

    const placed: Array<{ x: number; y: number; code: string }> = [];
    const layoutMap: Record<string, { x: number; y: number; radius: number; angleRad: number; origMidRad: number }> = {};

    indications.forEach((pi) => {
      const surface = getFlawSurface(pi);
      const isOd = surface === "OD";
      const candidates = isOd ? odCandidates : idCandidates;

      const flawLen = Math.max(120, pi.latestLength || 350);
      const midMm = pi.circumferentialPosition + flawLen / 2;
      const { angleRad: origMidRad, angleDeg: origAngleDeg } = mmToAngle(midMm);

      let chosen: { x: number; y: number; radius: number; angleRad: number; origMidRad: number } | null = null;

      for (const cand of candidates) {
        const candAngleDeg = origAngleDeg + cand.offsetDeg;
        const candAngleRad = degToAngleRad(candAngleDeg);

        const x = center + cand.radius * Math.cos(candAngleRad);
        const y = center + cand.radius * Math.sin(candAngleRad);

        // Check obstacle collision
        let collidesObstacle = false;
        for (const obs of obstacles) {
          if (Math.hypot(x - obs.x, y - obs.y) < obs.r) {
            collidesObstacle = true;
            break;
          }
        }
        if (collidesObstacle) continue;

        // Check center text clearance for ID badges
        if (!isOd && Math.hypot(x - center, y - center) < 55) {
          continue;
        }

        // Check collision against all previously placed badges
        let collidesBadge = false;
        for (const p of placed) {
          if (Math.hypot(x - p.x, y - p.y) < MIN_DIST) {
            collidesBadge = true;
            break;
          }
        }
        if (collidesBadge) continue;

        chosen = {
          x,
          y,
          radius: cand.radius,
          angleRad: candAngleRad,
          origMidRad,
        };
        break;
      }

      if (!chosen) {
        const defaultRadius = isOd ? odTiers[0] : idTiers[0];
        chosen = {
          x: center + defaultRadius * Math.cos(origMidRad),
          y: center + defaultRadius * Math.sin(origMidRad),
          radius: defaultRadius,
          angleRad: origMidRad,
          origMidRad,
        };
      }

      placed.push({ x: chosen.x, y: chosen.y, code: pi.code });
      layoutMap[pi.code] = chosen;
    });

    return layoutMap;
  }, [indications, center, outerRadius, innerRadius, totalCircumferenceMm]);

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

    // Check if hovering within a repaired / replaced zone
    const activeRepairZone = (repairZones || []).find(rz => {
      const wraps = rz.endMm > totalCircumferenceMm;
      return wraps
        ? (positionMm >= rz.startMm || positionMm <= (rz.endMm % totalCircumferenceMm))
        : (positionMm >= rz.startMm && positionMm <= rz.endMm);
    }) || null;

    setHoverPolar({
      xPx: x,
      yPx: y,
      angleDeg,
      positionMm,
      positionMeters,
      percentCircumference,
      currentSlot,
      hoveredFlaw,
      activeRepairZone,
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
            Coke Drum <strong>{drumName}</strong> ({weldName}) with 28 longitudinal slots (L1–L28) • Wall: <strong>{nominalWallThickness.toFixed(1)} mm</strong> • Clad: <strong>{effClad.toFixed(1)} mm</strong> • Bevel Groove: <strong>{jointDegrees}°</strong>
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
              {hoverPolar.activeRepairZone && (
                <>
                  <span className="text-slate-300 shrink-0">|</span>
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold shrink-0 text-[11px]">
                    <span>🔧 Replaced Zone</span>
                    <span className="font-mono text-[10px]">({(hoverPolar.activeRepairZone.startMm/1000).toFixed(1)}m–{(hoverPolar.activeRepairZone.endMm/1000).toFixed(1)}m)</span>
                  </div>
                </>
              )}
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

      {/* Main Grid: Polar Map on Left, Defect Table on Right (or full-width depending on layoutMode) */}
      <div className={`grid grid-cols-1 ${layoutMode === "SPLIT" ? "lg:grid-cols-12" : "grid-cols-1"} gap-5 items-start`}>
        {layoutMode !== "TABLE_ONLY" && (
          <div className={`${layoutMode === "CANVAS_ONLY" ? "col-span-1 relative flex justify-center items-center py-4" : "lg:col-span-7 relative flex justify-center items-center py-2"}`}>
            <svg
              ref={svgRef}
              viewBox="-50 -55 720 710"
              className={`w-full ${layoutMode === "CANVAS_ONLY" ? "max-w-[700px]" : "max-w-[560px]"} h-auto select-none cursor-crosshair overflow-visible`}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
            >
          {/* Solid Annular Vessel Shell Wall ("No crack" color from active configurable color scale) */}
          <circle
            cx={center}
            cy={center}
            r={midRadius}
            fill="none"
            stroke={activeColorScale.soundWallColor || "#7CFC00"}
            strokeWidth={wallThicknessPx}
          />

          {/* Shaded Internal Cladding Band (Tinted Navy Band on ID side) */}
          {effClad > 0 && (
            <circle
              cx={center}
              cy={center}
              r={innerRadius + ((effClad / nominalWallThickness) * wallThicknessPx) / 2}
              fill="none"
              stroke="#0284c7"
              strokeOpacity="0.22"
              strokeWidth={(effClad / nominalWallThickness) * wallThicknessPx}
            />
          )}

          {/* Replaced / Repaired Weld Sections (Distinct darker green shade #4E9A06 than base wall) */}
          {repairZones?.filter(rz => !weldName || rz.weldName === "ALL" || weldName.includes(rz.weldName) || rz.weldName.includes(weldName)).map(rz => {
            const startRad = mmToAngle(rz.startMm).angleRad;
            const endRad = mmToAngle(rz.endMm).angleRad;
            const arcPath = describeAnticlockwiseArc(center, center, midRadius, startRad, endRad);
            
            // Midpoint for badge / demarcation
            const midMm = (rz.startMm + rz.endMm) / 2;
            const midAngle = mmToAngle(midMm);
            const labelR = outerRadius + 18;
            const lx = center + labelR * Math.cos(midAngle.angleRad);
            const ly = center + labelR * Math.sin(midAngle.angleRad);

            // Radial boundary demarcation ticks
            const t1InnerX = center + (innerRadius - 4) * Math.cos(startRad);
            const t1InnerY = center + (innerRadius - 4) * Math.sin(startRad);
            const t1OuterX = center + (outerRadius + 8) * Math.cos(startRad);
            const t1OuterY = center + (outerRadius + 8) * Math.sin(startRad);

            const t2InnerX = center + (innerRadius - 4) * Math.cos(endRad);
            const t2InnerY = center + (innerRadius - 4) * Math.sin(endRad);
            const t2OuterX = center + (outerRadius + 8) * Math.cos(endRad);
            const t2OuterY = center + (outerRadius + 8) * Math.sin(endRad);

            return (
              <g key={rz.id} className="repair-zone-polar">
                {/* Darker shade arc for the replaced steel section */}
                <path
                  d={arcPath}
                  fill="none"
                  stroke="#4E9A06"
                  strokeWidth={wallThicknessPx}
                />
                {/* Radial boundary demarcation lines */}
                <line x1={t1InnerX} y1={t1InnerY} x2={t1OuterX} y2={t1OuterY} stroke="#0f172a" strokeWidth="2.5" strokeDasharray="3 2" />
                <line x1={t2InnerX} y1={t2InnerY} x2={t2OuterX} y2={t2OuterY} stroke="#0f172a" strokeWidth="2.5" strokeDasharray="3 2" />

                {/* Replaced Zone Tag */}
                <g transform={`translate(${lx}, ${ly})`}>
                  <rect x="-42" y="-9" width="84" height="18" rx="4" fill="#0f172a" opacity="0.95" stroke="#4E9A06" strokeWidth="1" />
                  <text x="0" y="3.5" textAnchor="middle" fontSize="8" fontWeight="900" fill="#7CFC00" fontFamily="sans-serif">
                    🔧 REPLACED
                  </text>
                </g>
              </g>
            );
          })}

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

          {/* Internal Cladding Layer Demarcation (Prominent Dark Navy Dotted Line - #0369a1) */}
          <circle
            cx={center}
            cy={center}
            r={cladRadius}
            fill="none"
            stroke="#0369a1"
            strokeWidth="2.5"
            strokeDasharray="4 3"
          />

          {/* Weld Bevel Root Guide (Subtle dashed concentric line) */}
          <circle
            cx={center}
            cy={center}
            r={rootRadius}
            fill="none"
            stroke="#475569"
            strokeWidth="1"
            strokeDasharray="2 3"
            opacity="0.45"
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

              {/* Slot label inside inner circumference - Bold, Large & High Contrast */}
              <text
                x={s.labelPos.x}
                y={s.labelPos.y + 5}
                textAnchor="middle"
                fontSize={s.label === "L1" || s.label === "L28" ? "15" : "13.5"}
                fontFamily="sans-serif"
                fontWeight="900"
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
          {/* North 0° - Completely unobstructed at 12 o'clock */}
          <g>
            <text
              x={center}
              y={center - cardinalRadius - 15}
              textAnchor="middle"
              fontSize="16"
              fontFamily="sans-serif"
              fontWeight="900"
              fill="#0f172a"
              letterSpacing="0.05em"
            >
              NORTH
            </text>
            <text
              x={center}
              y={center - cardinalRadius + 3}
              textAnchor="middle"
              fontSize="16"
              fontFamily="sans-serif"
              fontWeight="900"
              fill="#0f172a"
            >
              0°
            </text>
          </g>

          {/* 90° at Left (West / 9 o'clock) */}
          <text
            x={center - cardinalRadius - 12}
            y={center + 5}
            textAnchor="end"
            fontSize="16"
            fontFamily="sans-serif"
            fontWeight="900"
            fill="#0f172a"
          >
            90°
          </text>

          {/* 180° at Bottom (South / 6 o'clock) */}
          <text
            x={center}
            y={center + cardinalRadius + 20}
            textAnchor="middle"
            fontSize="16"
            fontFamily="sans-serif"
            fontWeight="900"
            fill="#0f172a"
          >
            180°
          </text>

          {/* 270° at Right (East / 3 o'clock) */}
          <text
            x={center + cardinalRadius + 12}
            y={center + 5}
            textAnchor="start"
            fontSize="16"
            fontFamily="sans-serif"
            fontWeight="900"
            fill="#0f172a"
          >
            270°
          </text>

          {/* Scanned Direction Indicator Positioned Far Upwards in White Space (Clear of all flaw markings) */}
          <g className="scanned-direction-indicator">
            <defs>
              <marker
                id="anticlockwise-arrow"
                markerWidth="8"
                markerHeight="8"
                refX="6"
                refY="4"
                orient="auto"
              >
                <polygon points="0 0, 8 4, 0 8" fill="#0284c7" />
              </marker>
            </defs>

            {/* Curved arrow path sweeping anticlockwise situated far upwards in upper-left quadrant (20° to 62°) */}
            {(() => {
              const arrowRadius = outerRadius + 84;
              const startA = degToAngleRad(20);
              const endA = degToAngleRad(62);
              const pathD = describeAnticlockwiseArc(center, center, arrowRadius, startA, endA);
              return (
                <g>
                  <path
                    d={pathD}
                    fill="none"
                    stroke="#0284c7"
                    strokeWidth="2.4"
                    strokeDasharray="4 3"
                    markerEnd="url(#anticlockwise-arrow)"
                  />
                  {/* Angle progression reference label along the arrow */}
                  <text
                    x={center + (arrowRadius + 14) * Math.cos(degToAngleRad(41))}
                    y={center + (arrowRadius + 14) * Math.sin(degToAngleRad(41))}
                    textAnchor="middle"
                    fontSize="10"
                    fontWeight="800"
                    fill="#0284c7"
                    fontFamily="sans-serif"
                  >
                    0° → 90°
                  </text>
                </g>
              );
            })()}

            {/* Scanned Direction Pill Badge placed far upwards in open white space (y = -18) */}
            <g transform={`translate(${center - 135}, -18)`}>
              <rect
                x="-85"
                y="-13"
                width="170"
                height="26"
                rx="13"
                fill="#0f172a"
                stroke="#0284c7"
                strokeWidth="1.5"
              />
              <text
                x="0"
                y="4.5"
                textAnchor="middle"
                fontSize="11"
                fontWeight="900"
                fill="#38bdf8"
                fontFamily="sans-serif"
                letterSpacing="0.04em"
              >
                ↺ SCANNED DIRECTION
              </text>
            </g>
          </g>

          {/* Center Vessel Designation - High Contrast, Bold & Large */}
          <text
            x={center}
            y={center - 12}
            textAnchor="middle"
            fontSize="17"
            fontWeight="900"
            fill="#0f172a"
          >
            {drumName}
          </text>
          <text
            x={center}
            y={center + 10}
            textAnchor="middle"
            fontSize="15"
            fontWeight="800"
            fill="#1e293b"
          >
            {weldName}
          </text>
          <text
            x={center}
            y={center + 30}
            textAnchor="middle"
            fontSize="14"
            fontWeight="700"
            fill="#475569"
          >
            {totalCircumferenceMm ? `${(totalCircumferenceMm / 1000).toFixed(2)} m Perimeter` : ""}
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

                {/* Bevel Boundary Overlay Lines — Rendered directly on top of ("upside") the marked defect patch */}
                <g className="defect-bevel-overlay pointer-events-none">
                  {/* Start of indication bevel boundary line across wall */}
                  <line
                    x1={center + innerRadius * Math.cos(startRad)}
                    y1={center + innerRadius * Math.sin(startRad)}
                    x2={center + outerRadius * Math.cos(startRad)}
                    y2={center + outerRadius * Math.sin(startRad)}
                    stroke="#0f172a"
                    strokeWidth="1.5"
                    strokeDasharray="2 2"
                  />
                  {/* End of indication bevel boundary line across wall */}
                  <line
                    x1={center + innerRadius * Math.cos(endRad)}
                    y1={center + innerRadius * Math.sin(endRad)}
                    x2={center + outerRadius * Math.cos(endRad)}
                    y2={center + outerRadius * Math.sin(endRad)}
                    stroke="#0f172a"
                    strokeWidth="1.5"
                    strokeDasharray="2 2"
                  />
                  {/* Clad dotted arc crossing over the marked defect (Dark Navy - #0369a1) */}
                  <path
                    d={describeAnticlockwiseArc(center, center, cladRadius, startRad, endRad)}
                    fill="none"
                    stroke="#0369a1"
                    strokeWidth="2.5"
                    strokeDasharray="4 3"
                  />
                </g>



                {/* Clean Numeric Badge on inner/outer side with smart non-overlapping positioning */}
                {(() => {
                  const layout = smartBadgeLayouts[pi.code];
                  const defaultRadius = surface === "OD" ? outerRadius + 22 : innerRadius - 38;
                  const bx = layout?.x ?? (center + defaultRadius * Math.cos(midRad));
                  const by = layout?.y ?? (center + defaultRadius * Math.sin(midRad));
                  const origMid = layout?.origMidRad ?? midRad;

                  return (
                    <PolarDefectBadge
                      surface={surface}
                      outerRadius={outerRadius}
                      innerRadius={innerRadius}
                      center={center}
                      origMidRad={origMid}
                      badgeX={bx}
                      badgeY={by}
                      isSelected={isSelected}
                      isHovered={isHovered}
                      defectNum={defectNum}
                    />
                  );
                })()}
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
      )}

      {/* Right: Side-by-Side Defect Details Table */}
      {layoutMode !== "CANVAS_ONLY" && (
          <div className={`${layoutMode === "TABLE_ONLY" ? "col-span-1" : "lg:col-span-5"} bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-3`}>
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                {weldName} Defect Log ({indications.length} Indications)
              </h4>
              <span className="text-[10px] text-slate-500 font-medium">Wall: {nominalWallThickness}mm</span>
            </div>

            <div className={`overflow-x-auto ${layoutMode === "TABLE_ONLY" ? "max-h-[600px]" : "max-h-[380px]"} overflow-y-auto`}>
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
                            activeRepairZone: (repairZones || []).find(rz => pi.circumferentialPosition >= rz.startMm && pi.circumferentialPosition <= rz.endMm) || null,
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
        )}
      </div>

      {/* Severity Color Legend Matching Reference Drawing & Active Color Scale */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-slate-700 pt-2 border-t border-slate-200">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-bold text-slate-900">Depth Legend:</span>

          <span className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded border border-slate-200">
            <span
              className="w-3.5 h-3.5 rounded-xs inline-block border border-slate-400/40"
              style={{ backgroundColor: activeColorScale.soundWallColor || "#7CFC00" }}
            ></span>
            <span className="font-medium">No crack (Sound Wall)</span>
          </span>

          <span className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded border border-emerald-300 bg-emerald-50/50">
            <span className="w-3.5 h-3.5 rounded-xs inline-block border border-slate-600/40" style={{ backgroundColor: "#4E9A06" }}></span>
            <span className="font-bold text-emerald-950">Replaced / Repaired Steel</span>
          </span>

          <span className="flex items-center gap-1.5 bg-blue-50 px-2 py-1 rounded border border-blue-300">
            <span className="w-5 h-0 border-t-2 border-dashed border-sky-700 inline-block"></span>
            <span className="font-bold text-sky-950">Clad Layer ({effClad.toFixed(1)}mm ID)</span>
          </span>

          {activeColorScale.tiers.map((tier) => (
            <span
              key={tier.id}
              className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded border border-slate-200"
            >
              <span
                className="w-3.5 h-3.5 rounded-xs inline-block"
                style={{ backgroundColor: tier.color }}
              ></span>
              <span className="font-medium">{tier.label}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

