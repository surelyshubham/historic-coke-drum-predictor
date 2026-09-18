"use client";

import { useState, useRef, useMemo, useEffect } from "react";
import { TrackedPhysicalIndication } from "@/lib/import/matrixParser";
import { 
  BevelJointType, 
  detectBevelTypeFromWeldName, 
  getBevelDefinition, 
  ALL_BEVEL_TYPES, 
  BEVEL_DEFINITIONS 
} from "@/lib/bevel/bevelClassifier";

interface WeldBevelSScanProfileProps {
  indication: TrackedPhysicalIndication;
  nominalWallThickness?: number; // default 32 mm
  cladThickness?: number; // default 3.0 mm
  jointDegrees?: number; // default 60.0 degrees (total groove angle)
  bevelType?: BevelJointType;
}

export function WeldBevelSScanProfile({
  indication,
  nominalWallThickness = 32.0,
  cladThickness = 3.0,
  jointDegrees = 60.0,
  bevelType,
}: WeldBevelSScanProfileProps) {
  const [hoverCursor, setHoverCursor] = useState<{
    xPx: number;
    yPx: number;
    depthFromIdMm: number;
    distanceFromOdMm: number;
    offsetFromCenterlineMm: number;
    percentOfWallThickness: number;
    remainingWallMm: number;
    zone: string;
  } | null>(null);

  // Surface view filter: "BOTH" | "ID" | "OD"
  const [surfaceFilter, setSurfaceFilter] = useState<"BOTH" | "ID" | "OD">("BOTH");

  const detectedBevel = useMemo(() => {
    return bevelType || detectBevelTypeFromWeldName(indication.weldName);
  }, [bevelType, indication.weldName]);

  const [selectedBevelType, setSelectedBevelType] = useState<BevelJointType>(detectedBevel);

  useEffect(() => {
    if (bevelType) {
      setSelectedBevelType(bevelType);
    } else {
      setSelectedBevelType(detectBevelTypeFromWeldName(indication.weldName));
    }
  }, [bevelType, indication.weldName]);

  const bevelDef = getBevelDefinition(selectedBevelType);

  const svgRef = useRef<SVGSVGElement | null>(null);

  // SVG Geometry for Horizontal Through-Thickness Slice
  // Matches client's horizontal reference drawings (Drawing Rows D–G)
  const width = 740;
  const height = 370;

  // Horizontal plate representing vessel shell wall cross-section
  const plateLeft = 55;
  const plateRight = 555;
  const plateWidth = plateRight - plateLeft; // 500 px
  const plateTop = 80; // OD Surface baseline
  const plateBottom = 270; // ID Surface
  const plateThicknessPx = plateBottom - plateTop; // 190 px
  const weldCenterX = (plateLeft + plateRight) / 2; // 305 px (0 mm centerline)

  // Coordinate Mapping:
  const xSpanMm = 55.0; // Half-width span (from centerline to edge)

  const scaleX = (offsetMm: number) => {
    return weldCenterX + (offsetMm / xSpanMm) * (plateWidth / 2);
  };

  const scaleYFromId = (depthFromIdMm: number) => {
    return plateBottom - (depthFromIdMm / nominalWallThickness) * plateThicknessPx;
  };

  const invertX = (xPx: number) => {
    return ((xPx - weldCenterX) / (plateWidth / 2)) * xSpanMm;
  };

  const invertY = (yPx: number) => {
    return ((plateBottom - yPx) / plateThicknessPx) * nominalWallThickness;
  };

  // Bevel Geometry & Dimensions from Active Bevel Definition:
  const grooveAngle = bevelDef.grooveAngleDeg;
  const halfAngleRad = ((grooveAngle / 2) * Math.PI) / 180;

  // Root face at ~11.5 mm for double-V, or ~3.0 mm for single-V
  const isDoubleV = bevelDef.isDoubleV;
  const rootDepthMm = isDoubleV
    ? Number((11.5 * (nominalWallThickness / 32.0)).toFixed(1))
    : 3.0;
  const rootY = scaleYFromId(rootDepthMm);
  const rootGapHalfMm = bevelDef.rootGapMm / 2;
  const backChipHalfWidthMm = bevelDef.backChipWidthMm / 2;

  // OD Side: Bevel half-width computed from groove angle
  const odDepthMm = nominalWallThickness - rootDepthMm;
  const odBevelHalfWidthMm = Number((rootGapHalfMm + odDepthMm * Math.tan(halfAngleRad)).toFixed(1));
  const odTtX = scaleX(-odBevelHalfWidthMm);
  const odBtX = scaleX(odBevelHalfWidthMm);

  // ID Side: Bevel half-width computed from ID groove angle (for double-V) or back-chip channel
  const idGrooveAngle = bevelDef.idGrooveAngleDeg || 50.0;
  const halfAngleIdRad = ((idGrooveAngle / 2) * Math.PI) / 180;
  const idBevelHalfWidthMm = isDoubleV
    ? Number((rootGapHalfMm + rootDepthMm * Math.tan(halfAngleIdRad)).toFixed(1))
    : backChipHalfWidthMm;
  const idTtX = scaleX(-idBevelHalfWidthMm);
  const idBtX = scaleX(idBevelHalfWidthMm);

  // Taper geometry (Types C, D, F):
  const hasTaper = bevelDef.hasTaper;
  const taperDeltaMm = hasTaper ? (bevelDef.taperThickOffsetMm || 5.0) : 0;
  const taperDeltaPx = (taperDeltaMm / nominalWallThickness) * plateThicknessPx;
  const taperStartX = odBtX + 15;
  const plateTopThick = plateTop - taperDeltaPx;

  // Cladding thickness (0mm if unclad skirt)
  const effCladThickness = bevelDef.hasCladding
    ? Math.max(0, cladThickness ?? bevelDef.defaultCladThicknessMm)
    : 0.0;
  const cladY = scaleYFromId(effCladThickness);
  const cladHeightPx = (effCladThickness / nominalWallThickness) * plateThicknessPx;

  // Dynamic Defect Parameters from Indication (Extracting both ID and OD measurements)
  const indAny = indication as unknown as Record<string, unknown>;
  const depthIdMm: number | null = typeof indAny.latestDepthId === 'number'
    ? indAny.latestDepthId
    : (typeof indAny.currentDepthId === 'number'
        ? indAny.currentDepthId
        : ((indication.weldPosition || "").toUpperCase().includes("OD") ? null : (indication.latestDepth || 5.5)));

  const depthOdMm: number | null = typeof indAny.latestDepthOd === 'number'
    ? indAny.latestDepthOd
    : (typeof indAny.currentDepthOd === 'number'
        ? indAny.currentDepthOd
        : ((indication.weldPosition || "").toUpperCase().includes("OD") ? (indication.latestDepth || 4.5) : null));

  const hasIdCrack = depthIdMm !== null && depthIdMm > 0;
  const hasOdCrack = depthOdMm !== null && depthOdMm > 0;

  // Parsed offset from "30MM TT", "50MM BT" etc.
  const offsetMm: number = typeof indAny.offsetMm === 'number' ? indAny.offsetMm : 0;
  const toeType: string = typeof indAny.toeType === 'string' ? indAny.toeType : '';
  const isTopToe = toeType === 'TT' || (indication.weldPosition || "").toUpperCase().includes("TT");
  const isBottomToe = toeType === 'BT' || (indication.weldPosition || "").toUpperCase().includes("BT");

  // Dynamic Horizontal Crack Origins based on actual parsed offsets from data
  // TT is on the left (-offset), BT is on the right (+offset)
  const idOriginX = offsetMm > 0
    ? (isBottomToe ? scaleX(offsetMm) : scaleX(-offsetMm))
    : (isBottomToe ? idBtX : idTtX);

  const odOriginX = offsetMm > 0
    ? (isBottomToe ? scaleX(offsetMm) : scaleX(-offsetMm))
    : (isBottomToe ? odBtX : odTtX);

  const cladStatus = (indAny.cladStatus as string) || "INCLUDING";

  // Generate ID Propagating Crack Curve (Penetrates from ID Bottom Surface UPWARDS towards OD)
  const idCrackPath = useMemo(() => {
    if (!hasIdCrack || depthIdMm === null) return null;
    const crackDepth = Math.max(1.0, Math.min(nominalWallThickness, depthIdMm));
    const crackDepthPx = (crackDepth / nominalWallThickness) * plateThicknessPx;

    const startX = idOriginX;
    const startY = plateBottom;
    const endX = startX + (isBottomToe ? -6 : 6);
    const endY = plateBottom - crackDepthPx;

    const cp1X = startX + (isBottomToe ? -2 : 2);
    const cp1Y = startY - crackDepthPx * 0.35;
    const cp2X = startX + (isBottomToe ? -5 : 5);
    const cp2Y = startY - crackDepthPx * 0.70;

    return {
      d: `M ${startX} ${startY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${endX} ${endY}`,
      tipX: endX,
      tipY: endY,
      originX: startX,
      originY: startY,
      depthMm: crackDepth,
      label: offsetMm > 0 ? `${offsetMm}mm ID ${isBottomToe ? 'BT' : 'TT'}` : `ID ${isBottomToe ? 'BT' : 'TT'}`,
    };
  }, [hasIdCrack, depthIdMm, nominalWallThickness, plateThicknessPx, plateBottom, idOriginX, isBottomToe, offsetMm]);

  // Generate OD Propagating Defect Curve (Penetrates from OD Top Surface DOWNWARDS towards ID)
  const odCrackPath = useMemo(() => {
    if (!hasOdCrack || depthOdMm === null) return null;
    const crackDepth = Math.max(1.0, Math.min(nominalWallThickness, depthOdMm));
    const crackDepthPx = (crackDepth / nominalWallThickness) * plateThicknessPx;

    const startX = odOriginX;
    const startY = plateTop;
    const endX = startX + (isBottomToe ? -6 : 6);
    const endY = plateTop + crackDepthPx;

    const cp1X = startX + (isBottomToe ? -2 : 2);
    const cp1Y = startY + crackDepthPx * 0.35;
    const cp2X = startX + (isBottomToe ? -5 : 5);
    const cp2Y = startY + crackDepthPx * 0.70;

    return {
      d: `M ${startX} ${startY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${endX} ${endY}`,
      tipX: endX,
      tipY: endY,
      originX: startX,
      originY: startY,
      depthMm: crackDepth,
      label: offsetMm > 0 ? `${offsetMm}mm OD ${isBottomToe ? 'BT' : 'TT'}` : `OD ${isBottomToe ? 'BT' : 'TT'}`,
    };
  }, [hasOdCrack, depthOdMm, nominalWallThickness, plateThicknessPx, plateTop, odOriginX, isBottomToe, offsetMm]);

  // Sound Ligament Calculation (Remaining uncracked wall)
  const totalFlawPenetration = (hasIdCrack ? (depthIdMm || 0) : 0) + (hasOdCrack ? (depthOdMm || 0) : 0);
  const soundWallRemainingMm = Number(Math.max(0, nominalWallThickness - totalFlawPenetration).toFixed(1));

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const xPx = e.clientX - rect.left;
    const yPx = e.clientY - rect.top;

    if (
      xPx < plateLeft ||
      xPx > plateRight ||
      yPx < plateTop ||
      yPx > plateBottom
    ) {
      setHoverCursor(null);
      return;
    }

    const depthFromIdMm = Number(Math.max(0, Math.min(nominalWallThickness, invertY(yPx))).toFixed(1));
    const distanceFromOdMm = Number((nominalWallThickness - depthFromIdMm).toFixed(1));
    const offsetFromCenterlineMm = Number(invertX(xPx).toFixed(1));
    const percentOfWallThickness = Number(((depthFromIdMm / nominalWallThickness) * 100).toFixed(1));

    let zone = "Base Metal (SA-387)";
    if (depthFromIdMm <= 3.0) {
      zone = "Type 410S Stainless Clad";
    } else if (yPx >= rootY) {
      const idFraction = (plateBottom - yPx) / (plateBottom - rootY);
      if (Math.abs(offsetFromCenterlineMm) <= idBevelHalfWidthMm * (1 - idFraction * 0.7)) {
        zone = "ID Weld Metal";
      } else if (Math.abs(offsetFromCenterlineMm) <= idBevelHalfWidthMm * 1.3) {
        zone = "ID Heat Affected Zone (HAZ)";
      }
    } else {
      const odFraction = (rootY - yPx) / (rootY - plateTop);
      if (Math.abs(offsetFromCenterlineMm) <= odBevelHalfWidthMm * (0.3 + odFraction * 0.7)) {
        zone = "OD Weld Metal";
      } else if (Math.abs(offsetFromCenterlineMm) <= odBevelHalfWidthMm * 1.25) {
        zone = "OD Heat Affected Zone (HAZ)";
      }
    }

    setHoverCursor({
      xPx,
      yPx,
      depthFromIdMm,
      distanceFromOdMm,
      offsetFromCenterlineMm,
      percentOfWallThickness,
      remainingWallMm: soundWallRemainingMm,
      zone,
    });
  };

  const handleMouseLeave = () => {
    setHoverCursor(null);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3">
      {/* Title & Live Readout Ribbon */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-bold text-slate-900 tracking-tight">
              {indication.code} — {bevelDef.shortName}
            </h4>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-sky-100 text-sky-800 uppercase tracking-wide">
              {nominalWallThickness.toFixed(1)} mm Wall
            </span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide ${
              bevelDef.hasCladding ? "bg-blue-100 text-blue-800" : "bg-slate-200 text-slate-700"
            }`}>
              {bevelDef.hasCladding ? `Clad: ${effCladThickness.toFixed(1)} mm` : "UNCLAD"}
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 uppercase tracking-wide">
              {grooveAngle.toFixed(0)}° Groove
            </span>
            {bevelDef.hasTaper && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 uppercase tracking-wide">
                1:10 OD Taper
              </span>
            )}
            {bevelDef.gtawRootPass && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 uppercase tracking-wide">
                GTAW Root
              </span>
            )}
            {cladStatus && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${cladStatus === "INCLUDING" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                Clad: {cladStatus}
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {bevelDef.drawingRef} • Material: <strong>{bevelDef.baseMaterial}</strong> • Position: <strong>{indication.weldPosition || "Weld Toe"}</strong>
          </p>
        </div>

        {/* Surface View Mode Selector */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-[11px] font-semibold">
          <button
            type="button"
            onClick={() => setSurfaceFilter("BOTH")}
            className={`px-2.5 py-1 rounded transition cursor-pointer ${
              surfaceFilter === "BOTH" ? "bg-white text-slate-900 shadow-2xs font-bold" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Both ID &amp; OD
          </button>
          <button
            type="button"
            onClick={() => setSurfaceFilter("ID")}
            className={`px-2.5 py-1 rounded transition cursor-pointer ${
              surfaceFilter === "ID" ? "bg-white text-red-700 shadow-2xs font-bold" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            ID ({hasIdCrack ? `${depthIdMm} mm` : "N/A"})
          </button>
          <button
            type="button"
            onClick={() => setSurfaceFilter("OD")}
            className={`px-2.5 py-1 rounded transition cursor-pointer ${
              surfaceFilter === "OD" ? "bg-white text-amber-700 shadow-2xs font-bold" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            OD ({hasOdCrack ? `${depthOdMm} mm` : "N/A"})
          </button>
        </div>
      </div>

      {/* Interactive Bevel Shape Profile Selector Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-700 flex items-center gap-1.5">
            <span>Joint Bevel Profile:</span>
          </span>
          <select
            value={selectedBevelType}
            onChange={(e) => setSelectedBevelType(e.target.value as BevelJointType)}
            className="bg-white border border-slate-300 rounded px-2.5 py-1 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-sky-500 focus:outline-none cursor-pointer"
          >
            {ALL_BEVEL_TYPES.map((bt) => {
              const def = BEVEL_DEFINITIONS[bt];
              return (
                <option key={bt} value={bt}>
                  [{def.drawingRow}] {def.shortName}
                </option>
              );
            })}
          </select>
        </div>

        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-slate-500 font-medium">Auto-Detected: <strong>{BEVEL_DEFINITIONS[detectedBevel].shortName}</strong></span>
          {selectedBevelType !== detectedBevel && (
            <button
              type="button"
              onClick={() => setSelectedBevelType(detectedBevel)}
              className="px-2 py-0.5 text-xs font-bold text-sky-700 bg-sky-50 border border-sky-200 rounded hover:bg-sky-100 transition cursor-pointer"
            >
              Reset to Auto
            </button>
          )}
        </div>
      </div>

      {/* SVG Canvas Matching the User's Engineering Reference Diagrams (Rows D–G) */}
      <div className="relative border border-slate-300 rounded-lg overflow-hidden bg-white shadow-inner flex justify-center py-2">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full max-w-[740px] h-auto select-none cursor-crosshair overflow-visible"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <defs>
            {/* Ultrasonic Amplitude Echo Heatmap for Crack Tip */}
            <radialGradient id={`crackTipJet-${indication.code}`} cx="45%" cy="45%" r="55%">
              <stop offset="0%" stopColor="#b91c1c" stopOpacity="0.95" />
              <stop offset="30%" stopColor="#ea580c" stopOpacity="0.90" />
              <stop offset="55%" stopColor="#eab308" stopOpacity="0.80" />
              <stop offset="75%" stopColor="#16a34a" stopOpacity="0.65" />
              <stop offset="100%" stopColor="#0284c7" stopOpacity="0.0" />
            </radialGradient>
          </defs>

          {/* Vessel Shell Plate: With 1:10 Taper on OD for Types C, D, F or Flat for Uniform */}
          {hasTaper ? (
            <g className="taper-plate">
              <path
                d={`
                  M ${plateLeft} ${plateTop}
                  L ${taperStartX} ${plateTop}
                  L ${plateRight} ${plateTopThick}
                  L ${plateRight} ${plateBottom}
                  L ${plateLeft} ${plateBottom}
                  Z
                `}
                fill="#ffffff"
                stroke="#0f172a"
                strokeWidth="3.2"
              />
              {/* 1:10 Taper Slope Callout Indicator */}
              <g transform={`translate(${taperStartX + 30}, ${plateTop - 10})`}>
                <polygon
                  points="0,0 45,-4.5 45,0"
                  fill="#f0fdf4"
                  stroke="#16a34a"
                  strokeWidth="1.2"
                />
                <text x="22" y="-6" textAnchor="middle" fontSize="9.5" fontWeight="bold" fill="#16a34a">
                  1 : 10
                </text>
                <text x="52" y="-1" fontSize="9" fontWeight="bold" fill="#475569">
                  OD Taper (+{taperDeltaMm}mm)
                </text>
              </g>
            </g>
          ) : (
            <rect
              x={plateLeft}
              y={plateTop}
              width={plateWidth}
              height={plateThicknessPx}
              fill="#ffffff"
              stroke="#0f172a"
              strokeWidth="3.2"
            />
          )}

          {/* Internal Stainless Steel Clad Layer along ID Bottom Surface (omitted on unclad skirt) */}
          {bevelDef.hasCladding && effCladThickness > 0 && (
            <g className="clad-layer">
              <rect
                x={plateLeft}
                y={cladY}
                width={plateWidth}
                height={cladHeightPx}
                fill="#38bdf8"
                fillOpacity="0.14"
                stroke="#0284c7"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              <text
                x={plateRight - 16}
                y={cladY + cladHeightPx / 2 + 3.5}
                textAnchor="end"
                fontSize="9"
                fontWeight="bold"
                fill="#0284c7"
              >
                CLAD ({effCladThickness.toFixed(1)} mm)
              </text>
            </g>
          )}

          {/* Weld Metal Fill: Asymmetric Double-V or Single-V */}
          {isDoubleV ? (
            <g className="double-v-weld-metal">
              {/* Top / OD Bevel Triangle: 45° groove from OD (plateTop) to Root (rootY) */}
              <polygon
                points={`
                  ${odTtX},${plateTop}
                  ${odBtX},${plateTop}
                  ${weldCenterX + 3},${rootY}
                  ${weldCenterX - 3},${rootY}
                `}
                fill="#cbd5e1"
                stroke="#64748b"
                strokeWidth="1.2"
              />
              {/* Bottom / ID Bevel Triangle: from Root (rootY) to ID (plateBottom) */}
              <polygon
                points={`
                  ${idTtX},${plateBottom}
                  ${weldCenterX - 3},${rootY}
                  ${weldCenterX + 3},${rootY}
                  ${idBtX},${plateBottom}
                `}
                fill="#cbd5e1"
                stroke="#64748b"
                strokeWidth="1.2"
              />
              {/* Root Face Horizontal Line */}
              <line
                x1={weldCenterX - 3}
                y1={rootY}
                x2={weldCenterX + 3}
                y2={rootY}
                stroke="#475569"
                strokeWidth="2"
              />
            </g>
          ) : (
            <g className="single-v-weld-metal">
              {/* 50° Single-V from OD down to Root Channel */}
              <polygon
                points={`
                  ${odTtX},${plateTop}
                  ${odBtX},${plateTop}
                  ${scaleX(backChipHalfWidthMm)},${scaleYFromId(2.5)}
                  ${scaleX(-backChipHalfWidthMm)},${scaleYFromId(2.5)}
                `}
                fill="#cbd5e1"
                stroke="#64748b"
                strokeWidth="1.2"
              />
            </g>
          )}

          {/* Inconel Root Overlay (INCO.) in the Back-Chip Channel on ID */}
          {bevelDef.inconelOverlay && (
            <g className="inconel-overlay">
              <polygon
                points={`
                  ${scaleX(-backChipHalfWidthMm - 2)},${plateBottom}
                  ${scaleX(-backChipHalfWidthMm)},${scaleYFromId(2.8)}
                  ${scaleX(backChipHalfWidthMm)},${scaleYFromId(2.8)}
                  ${scaleX(backChipHalfWidthMm + 2)},${plateBottom}
                `}
                fill="#fef3c7"
                stroke="#d97706"
                strokeWidth="1.2"
              />
              <text
                x={weldCenterX}
                y={plateBottom - 5.5}
                textAnchor="middle"
                fontSize="8.5"
                fontWeight="900"
                fill="#b45309"
              >
                INCO.
              </text>
            </g>
          )}

          {/* OD Convex Cap Crown (for Skirt Type E) */}
          {bevelDef.odCapStyle === "CONVEX" && (
            <path
              d={`M ${odTtX} ${plateTop} Q ${weldCenterX} ${plateTop - 12} ${odBtX} ${plateTop} Z`}
              fill="#94a3b8"
              stroke="#64748b"
              strokeWidth="1.2"
            />
          )}

          {/* ID Heavy MAX 2.0mm Convex Crown (for Type F C12) */}
          {bevelDef.idCapProtrusionMaxMm >= 2.0 && (
            <path
              d={`M ${idTtX} ${plateBottom} Q ${weldCenterX} ${plateBottom + 12} ${idBtX} ${plateBottom} Z`}
              fill="#fef3c7"
              stroke="#d97706"
              strokeWidth="1.2"
            />
          )}

          {/* GTAW Root Pass Callout Badge (Type B L1~L7) */}
          {bevelDef.gtawRootPass && (
            <g transform={`translate(${weldCenterX + 45}, ${plateBottom - 26})`}>
              <rect x="0" y="0" width="136" height="18" rx="3" fill="#ecfdf5" stroke="#10b981" strokeWidth="1" />
              <text x="68" y="12" textAnchor="middle" fontSize="9" fontWeight="bold" fill="#047857">
                FIRST PASS BY G.T.A.W.
              </text>
            </g>
          )}

          {/* Green Vertical Weld Centerline */}
          <line
            x1={weldCenterX}
            y1={plateTop - 25}
            x2={weldCenterX}
            y2={plateBottom + 25}
            stroke="#16a34a"
            strokeWidth="1.5"
            strokeDasharray="5 3"
          />

          {/* Weld Center Text Label reading upright directly above centerline */}
          <text
            x={weldCenterX}
            y={plateTop - 32}
            textAnchor="middle"
            fontSize="11"
            fontFamily="sans-serif"
            fontWeight="700"
            fill="#16a34a"
          >
            Weld Center (0 mm)
          </text>

          {/* OD Surface Boundary Header (Left of top horizontal line) */}
          <g transform={`translate(${plateLeft - 44}, ${plateTop})`}>
            <rect
              x="0"
              y="-12"
              width="36"
              height="24"
              rx="4"
              fill="#f8fafc"
              stroke="#cbd5e1"
              strokeWidth="1"
            />
            <text
              x="18"
              y="4.5"
              textAnchor="middle"
              fontSize="11"
              fontWeight="900"
              fontFamily="sans-serif"
              fill="#0f172a"
            >
              OD
            </text>
          </g>

          {/* ID Surface Boundary Header (Left of bottom horizontal line) */}
          <g transform={`translate(${plateLeft - 44}, ${plateBottom})`}>
            <rect
              x="0"
              y="-12"
              width="36"
              height="24"
              rx="4"
              fill="#f8fafc"
              stroke="#cbd5e1"
              strokeWidth="1"
            />
            <text
              x="18"
              y="4.5"
              textAnchor="middle"
              fontSize="11"
              fontWeight="900"
              fontFamily="sans-serif"
              fill="#0f172a"
            >
              ID
            </text>
          </g>

          {/* OD Landmarks: TT (Top Toe) and BT (Bottom Toe) along top horizontal edge */}
          <g className="od-landmarks">
            <line
              x1={odTtX}
              y1={plateTop - 8}
              x2={odTtX}
              y2={plateTop}
              stroke="#94a3b8"
              strokeWidth="1"
              strokeDasharray="2 2"
            />
            <text
              x={odTtX}
              y={plateTop - 12}
              textAnchor="middle"
              fontSize="11"
              fontWeight="800"
              fontFamily="sans-serif"
              fill="#334155"
            >
              TT
            </text>

            <line
              x1={odBtX}
              y1={plateTop - 8}
              x2={odBtX}
              y2={plateTop}
              stroke="#94a3b8"
              strokeWidth="1"
              strokeDasharray="2 2"
            />
            <text
              x={odBtX}
              y={plateTop - 12}
              textAnchor="middle"
              fontSize="11"
              fontWeight="800"
              fontFamily="sans-serif"
              fill="#334155"
            >
              BT
            </text>
          </g>

          {/* ID Landmarks: TT (Top Toe) and BT (Bottom Toe) along bottom horizontal edge */}
          <g className="id-landmarks">
            <line
              x1={idTtX}
              y1={plateBottom}
              x2={idTtX}
              y2={plateBottom + 8}
              stroke="#94a3b8"
              strokeWidth="1"
              strokeDasharray="2 2"
            />
            <text
              x={idTtX}
              y={plateBottom + 20}
              textAnchor="middle"
              fontSize="11"
              fontWeight="800"
              fontFamily="sans-serif"
              fill="#334155"
            >
              TT
            </text>

            <line
              x1={idBtX}
              y1={plateBottom}
              x2={idBtX}
              y2={plateBottom + 8}
              stroke="#94a3b8"
              strokeWidth="1"
              strokeDasharray="2 2"
            />
            <text
              x={idBtX}
              y={plateBottom + 20}
              textAnchor="middle"
              fontSize="11"
              fontWeight="800"
              fontFamily="sans-serif"
              fill="#334155"
            >
              BT
            </text>
          </g>

          {/* 1. Propagating ID Crack (Initiates at ID bottom surface, penetrates UPWARDS towards OD) */}
          {(surfaceFilter === "BOTH" || surfaceFilter === "ID") && idCrackPath && (
            <g className="propagating-id-crack">
              {/* Glow backing */}
              <path
                d={idCrackPath.d}
                fill="none"
                stroke="#fca5a5"
                strokeWidth="6"
                strokeLinecap="round"
                strokeOpacity="0.45"
              />
              {/* Main Red Crack Path */}
              <path
                d={idCrackPath.d}
                fill="none"
                stroke="#dc2626"
                strokeWidth="3.2"
                strokeLinecap="round"
              />

              {/* Crack Origin Dot on ID */}
              <circle
                cx={idCrackPath.originX}
                cy={idCrackPath.originY}
                r="3.5"
                fill="#b91c1c"
              />

              {/* Ultrasonic Amplitude Echo Heatmap at ID Crack Tip */}
              <circle
                cx={idCrackPath.tipX}
                cy={idCrackPath.tipY}
                r="14"
                fill={`url(#crackTipJet-${indication.code})`}
              />
              <circle
                cx={idCrackPath.tipX}
                cy={idCrackPath.tipY}
                r="3"
                fill="#991b1b"
              />

              {/* ID Crack Depth Callout Annotation — Positioned into clear base metal with leader line so it never blocks the crack or bevel */}
              {(() => {
                const boxW = 142;
                const boxH = 22;
                const isLeft = idCrackPath.tipX <= weldCenterX;
                const boxX = isLeft
                  ? Math.max(plateLeft + 12, idCrackPath.tipX - boxW - 28)
                  : Math.min(plateRight - boxW - 12, idCrackPath.tipX + 28);
                // Float comfortably in the upper clear base metal area well above the bottom clad zone
                const boxY = Math.max(plateTop + 14, Math.min(plateBottom - 48, idCrackPath.tipY - boxH - 16));
                const leaderStartX = isLeft ? boxX + boxW : boxX;
                const leaderStartY = boxY + boxH / 2;
                const leaderEndX = isLeft ? idCrackPath.tipX - 12 : idCrackPath.tipX + 12;
                const leaderEndY = idCrackPath.tipY;

                return (
                  <g className="id-crack-callout">
                    {/* Leader pointer line connecting callout to crack tip */}
                    <line
                      x1={leaderStartX}
                      y1={leaderStartY}
                      x2={leaderEndX}
                      y2={leaderEndY}
                      stroke="#dc2626"
                      strokeWidth="1.2"
                      strokeDasharray="2 2"
                    />
                    <circle cx={leaderEndX} cy={leaderEndY} r="2" fill="#dc2626" />

                    {/* Non-blocking callout badge */}
                    <g transform={`translate(${boxX}, ${boxY})`}>
                      <rect
                        x="0"
                        y="0"
                        width={boxW}
                        height={boxH}
                        rx="4"
                        fill="#ffffff"
                        fillOpacity="0.95"
                        stroke="#dc2626"
                        strokeWidth="1"
                        className="shadow-xs"
                      />
                      <text
                        x={boxW / 2}
                        y="15"
                        textAnchor="middle"
                        fontSize="10"
                        fontWeight="bold"
                        fontFamily="sans-serif"
                        fill="#dc2626"
                      >
                        ID Depth: {idCrackPath.depthMm.toFixed(1)} mm ({((idCrackPath.depthMm / nominalWallThickness) * 100).toFixed(0)}%)
                      </text>
                    </g>
                  </g>
                );
              })()}
            </g>
          )}

          {/* 2. Propagating OD Crack/Flaw (Initiates at OD top surface, penetrates DOWNWARDS towards ID) */}
          {(surfaceFilter === "BOTH" || surfaceFilter === "OD") && odCrackPath && (
            <g className="propagating-od-crack">
              {/* Glow backing */}
              <path
                d={odCrackPath.d}
                fill="none"
                stroke="#fed7aa"
                strokeWidth="6"
                strokeLinecap="round"
                strokeOpacity="0.45"
              />
              {/* Main Amber-Red Crack Path */}
              <path
                d={odCrackPath.d}
                fill="none"
                stroke="#ea580c"
                strokeWidth="3.2"
                strokeLinecap="round"
              />

              {/* Crack Origin Dot on OD */}
              <circle
                cx={odCrackPath.originX}
                cy={odCrackPath.originY}
                r="3.5"
                fill="#c2410c"
              />

              {/* Ultrasonic Amplitude Echo Heatmap at OD Crack Tip */}
              <circle
                cx={odCrackPath.tipX}
                cy={odCrackPath.tipY}
                r="14"
                fill={`url(#crackTipJet-${indication.code})`}
              />
              <circle
                cx={odCrackPath.tipX}
                cy={odCrackPath.tipY}
                r="3"
                fill="#9a3412"
              />

              {/* OD Crack Depth Callout Annotation — Positioned into clear base metal with leader line so it never blocks the crack or bevel */}
              {(() => {
                const boxW = 142;
                const boxH = 22;
                const isLeft = odCrackPath.tipX <= weldCenterX;
                const boxX = isLeft
                  ? Math.max(plateLeft + 12, odCrackPath.tipX - boxW - 28)
                  : Math.min(plateRight - boxW - 12, odCrackPath.tipX + 28);
                // Float comfortably in lower clear base metal below the top OD surface
                const boxY = Math.max(plateTop + 24, Math.min(plateBottom - 30, odCrackPath.tipY + 16));
                const leaderStartX = isLeft ? boxX + boxW : boxX;
                const leaderStartY = boxY + boxH / 2;
                const leaderEndX = isLeft ? odCrackPath.tipX - 12 : odCrackPath.tipX + 12;
                const leaderEndY = odCrackPath.tipY;

                return (
                  <g className="od-crack-callout">
                    {/* Leader pointer line connecting callout to crack tip */}
                    <line
                      x1={leaderStartX}
                      y1={leaderStartY}
                      x2={leaderEndX}
                      y2={leaderEndY}
                      stroke="#ea580c"
                      strokeWidth="1.2"
                      strokeDasharray="2 2"
                    />
                    <circle cx={leaderEndX} cy={leaderEndY} r="2" fill="#ea580c" />

                    {/* Non-blocking callout badge */}
                    <g transform={`translate(${boxX}, ${boxY})`}>
                      <rect
                        x="0"
                        y="0"
                        width={boxW}
                        height={boxH}
                        rx="4"
                        fill="#ffffff"
                        fillOpacity="0.95"
                        stroke="#ea580c"
                        strokeWidth="1"
                        className="shadow-xs"
                      />
                      <text
                        x={boxW / 2}
                        y="15"
                        textAnchor="middle"
                        fontSize="10"
                        fontWeight="bold"
                        fontFamily="sans-serif"
                        fill="#ea580c"
                      >
                        OD Depth: {odCrackPath.depthMm.toFixed(1)} mm ({((odCrackPath.depthMm / nominalWallThickness) * 100).toFixed(0)}%)
                      </text>
                    </g>
                  </g>
                );
              })()}
            </g>
          )}

          {/* Sound Ligament Visual Link between crack tips if both present */}
          {hasIdCrack && hasOdCrack && idCrackPath && odCrackPath && soundWallRemainingMm > 0 && (
            <g className="sound-ligament-guide pointer-events-none">
              <line
                x1={weldCenterX}
                y1={odCrackPath.tipY}
                x2={weldCenterX}
                y2={idCrackPath.tipY}
                stroke="#16a34a"
                strokeWidth="1.5"
                strokeDasharray="3 3"
              />
              <circle cx={weldCenterX} cy={odCrackPath.tipY} r="2.5" fill="#16a34a" />
              <circle cx={weldCenterX} cy={idCrackPath.tipY} r="2.5" fill="#16a34a" />
            </g>
          )}

          {/* Bevel Fusion Lines Overlay — Drawn explicitly ON TOP ("upside") the marked crack & heat area */}
          <g className="bevel-fusion-lines-overlay pointer-events-none">
            {/* OD Left Bevel Line */}
            <line
              x1={odTtX}
              y1={plateTop}
              x2={weldCenterX - 3}
              y2={rootY}
              stroke="#334155"
              strokeWidth="2"
            />
            {/* OD Right Bevel Line */}
            <line
              x1={odBtX}
              y1={plateTop}
              x2={weldCenterX + 3}
              y2={rootY}
              stroke="#334155"
              strokeWidth="2"
            />
            {/* ID Left Bevel Line */}
            <line
              x1={idTtX}
              y1={plateBottom}
              x2={weldCenterX - 3}
              y2={rootY}
              stroke="#334155"
              strokeWidth="2"
            />
            {/* ID Right Bevel Line */}
            <line
              x1={idBtX}
              y1={plateBottom}
              x2={weldCenterX + 3}
              y2={rootY}
              stroke="#334155"
              strokeWidth="2"
            />
            {/* Root Face Horizontal Line */}
            <line
              x1={weldCenterX - 3}
              y1={rootY}
              x2={weldCenterX + 3}
              y2={rootY}
              stroke="#0f172a"
              strokeWidth="2.5"
            />
            {/* Dotted Clad Boundary Line overlaying across the entire plate and weld area */}
            <line
              x1={plateLeft}
              y1={cladY}
              x2={plateRight}
              y2={cladY}
              stroke="#0284c7"
              strokeWidth="1.2"
              strokeDasharray="3 3"
            />
          </g>

          {/* Vertical Thickness Dimension Ruler on the right */}
          <g transform={`translate(${plateRight + 25}, 0)`}>
            <line
              x1="0"
              y1={plateTop}
              x2="0"
              y2={plateBottom}
              stroke="#475569"
              strokeWidth="1.2"
            />
            <line x1="-5" y1={plateTop} x2="5" y2={plateTop} stroke="#475569" strokeWidth="1.2" />
            <line x1="-5" y1={plateBottom} x2="5" y2={plateBottom} stroke="#475569" strokeWidth="1.2" />
            <text
              x="12"
              y={(plateTop + plateBottom) / 2 - 7}
              fontSize="10"
              fontWeight="bold"
              fontFamily="sans-serif"
              fill="#475569"
            >
              Nominal Wall Thickness:
            </text>
            <text
              x="12"
              y={(plateTop + plateBottom) / 2 + 10}
              fontSize="12"
              fontWeight="900"
              fontFamily="sans-serif"
              fill="#0f172a"
            >
              {nominalWallThickness.toFixed(1)} mm
            </text>
          </g>

          {/* Interactive Floating Crosshair Cursor */}
          {hoverCursor && (
            <g className="floating-crosshair pointer-events-none">
              <line
                x1={hoverCursor.xPx}
                y1={plateTop}
                x2={hoverCursor.xPx}
                y2={plateBottom}
                stroke="#0284c7"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              <line
                x1={plateLeft}
                y1={hoverCursor.yPx}
                x2={plateRight}
                y2={hoverCursor.yPx}
                stroke="#0284c7"
                strokeWidth="1"
                strokeDasharray="3 3"
              />

              {/* Hollow reticle with clear center */}
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

        {/* Docked Inspector HUD Card — Stays in opposite corner */}
        {hoverCursor && (
          <div
            className={`absolute pointer-events-none z-30 bg-white/95 backdrop-blur-md border border-slate-300 rounded-lg shadow-xl p-3 text-xs text-slate-800 transition-all duration-100 ${
              hoverCursor.xPx > width / 2 ? "left-3 top-3" : "right-3 top-3"
            }`}
            style={{
              minWidth: "240px",
            }}
          >
            <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-200">
              <span className="font-bold text-slate-900">Through-Wall Slice</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-sky-100 text-sky-800">
                {hoverCursor.percentOfWallThickness}% Wall Depth
              </span>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Cursor Depth from ID:</span>
                <span className="font-mono font-bold text-sky-800">{hoverCursor.depthFromIdMm} mm</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Cursor Dist from OD:</span>
                <span className="font-mono font-bold text-slate-900">{hoverCursor.distanceFromOdMm} mm</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Centerline Offset:</span>
                <span className="font-mono font-bold text-slate-900">
                  {hoverCursor.offsetFromCenterlineMm > 0 ? `+${hoverCursor.offsetFromCenterlineMm}` : hoverCursor.offsetFromCenterlineMm} mm
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Material Zone:</span>
                <span className="font-semibold text-slate-700">{hoverCursor.zone}</span>
              </div>
              {hasIdCrack && (
                <div className="flex justify-between text-red-700 font-semibold pt-1 border-t border-slate-100">
                  <span>ID Flaw Depth:</span>
                  <span className="font-mono">{depthIdMm?.toFixed(1)} mm</span>
                </div>
              )}
              {hasOdCrack && (
                <div className="flex justify-between text-amber-700 font-semibold">
                  <span>OD Flaw Depth:</span>
                  <span className="font-mono">{depthOdMm?.toFixed(1)} mm</span>
                </div>
              )}
              <div className="pt-1.5 border-t border-slate-100 flex justify-between">
                <span className="text-slate-500">Sound Ligament:</span>
                <span className="font-bold text-emerald-700 font-mono">
                  {soundWallRemainingMm} mm
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Cross-Section Engineering Metadata */}
      <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-600 pt-1 border-t border-slate-100 gap-2">
        <div className="flex flex-wrap items-center gap-4">
          <span>Position: <strong className="text-slate-800">{indication.weldPosition || "Weld Toe"}</strong></span>
          {hasIdCrack && (
            <span>ID Depth: <strong className="text-red-700">{depthIdMm?.toFixed(1)} mm</strong> ({((depthIdMm! / nominalWallThickness) * 100).toFixed(0)}%)</span>
          )}
          {hasOdCrack && (
            <span>OD Depth: <strong className="text-amber-700">{depthOdMm?.toFixed(1)} mm</strong> ({((depthOdMm! / nominalWallThickness) * 100).toFixed(0)}%)</span>
          )}
          <span>Sound Ligament: <strong className="text-emerald-700 font-mono">{soundWallRemainingMm} mm</strong></span>
        </div>
        <span className="text-slate-400 italic">Asymmetric Double-V (X-Groove) • Weld Center 0 mm</span>
      </div>
    </div>
  );
}

