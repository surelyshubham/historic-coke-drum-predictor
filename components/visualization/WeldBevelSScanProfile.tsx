"use client";

import { useState, useRef, useMemo } from "react";
import { TrackedPhysicalIndication } from "@/lib/import/matrixParser";

interface WeldBevelSScanProfileProps {
  indication: TrackedPhysicalIndication;
  nominalWallThickness?: number; // default 32 mm
}

export function WeldBevelSScanProfile({
  indication,
  nominalWallThickness = 32.0,
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

  const svgRef = useRef<SVGSVGElement | null>(null);

  // SVG Geometry for Tall Vertical Through-Thickness Slice
  // Matches authentic engineering reference drawing (media_1788721266007.png)
  const width = 460;
  const height = 640;

  // Tall vertical plate slice representing vessel shell wall
  const plateWidth = 170; // Represents nominalWallThickness (user configured)
  const plateHeight = 500; // Represents shell height (-55 mm to +55 mm)
  const plateLeft = (width - plateWidth) / 2; // 145 px
  const plateRight = plateLeft + plateWidth; // 315 px
  const plateTop = 50;
  const plateBottom = plateTop + plateHeight; // 550 px
  const weldCenterY = (plateTop + plateBottom) / 2; // 300 px (0 mm centerline)

  // Coordinate Mapping:
  // Horizontal (X): 0 mm (ID) at plateLeft to nominalWallThickness (OD) at plateRight
  // Vertical (Y): -55 mm (Bottom) at plateBottom to +55 mm (Top) at plateTop
  const ySpanMm = 55.0; // Half-height span

  const scaleX = (valMm: number) => {
    return plateLeft + (valMm / nominalWallThickness) * plateWidth;
  };

  const scaleY = (yMm: number) => {
    // Invert Y so +yMm (Top) is upwards
    return weldCenterY - (yMm / ySpanMm) * (plateHeight / 2);
  };

  const invertX = (xPx: number) => {
    return ((xPx - plateLeft) / plateWidth) * nominalWallThickness;
  };

  const invertY = (yPx: number) => {
    return ((weldCenterY - yPx) / (plateHeight / 2)) * ySpanMm;
  };

  // Double-V Bevel Geometry (dynamically scaled to nominal wall thickness):
  // Root face at ~11.5 mm scaled proportionally
  const rootDepthMm = Number((11.5 * (nominalWallThickness / 32.0)).toFixed(1));
  const rootX = scaleX(rootDepthMm);

  // ID Side (Left): Narrower and shorter bevel
  const idBevelTopYMm = 11.0;
  const idBevelBottomYMm = -11.0;
  const idTtY = scaleY(idBevelTopYMm);
  const idBtY = scaleY(idBevelBottomYMm);

  // OD Side (Right): Wider and taller bevel
  const odBevelTopYMm = 22.0;
  const odBevelBottomYMm = -22.0;
  const odTtY = scaleY(odBevelTopYMm);
  const odBtY = scaleY(odBevelBottomYMm);

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

  // Dynamic Vertical Crack Origins based on actual parsed offsets from data
  const idOriginY = offsetMm > 0
    ? (isBottomToe ? scaleY(-offsetMm) : scaleY(offsetMm))
    : (isBottomToe ? idBtY : idTtY);

  const odOriginY = offsetMm > 0
    ? (isBottomToe ? scaleY(-offsetMm) : scaleY(offsetMm))
    : (isBottomToe ? odBtY : odTtY);

  const cladStatus = (indAny.cladStatus as string) || "INCLUDING";

  // Generate ID Propagating Crack Curve (Penetrates from ID Left Edge towards OD)
  const idCrackPath = useMemo(() => {
    if (!hasIdCrack || depthIdMm === null) return null;
    const crackDepth = Math.max(1.0, Math.min(nominalWallThickness, depthIdMm));
    const crackDepthPx = (crackDepth / nominalWallThickness) * plateWidth;

    const startX = plateLeft;
    const startY = idOriginY;
    const endX = plateLeft + crackDepthPx;
    const endY = startY + (isTopToe ? 6 : -6);

    const cp1X = startX + crackDepthPx * 0.35;
    const cp1Y = startY - (isTopToe ? 5 : -5);
    const cp2X = startX + crackDepthPx * 0.70;
    const cp2Y = startY + (isTopToe ? 7 : -7);

    return {
      d: `M ${startX} ${startY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${endX} ${endY}`,
      tipX: endX,
      tipY: endY,
      originX: startX,
      originY: startY,
      depthMm: crackDepth,
      label: offsetMm > 0 ? `${offsetMm}mm ID ${isBottomToe ? 'BT' : 'TT'}` : `ID ${isBottomToe ? 'BT' : 'TT'}`,
    };
  }, [hasIdCrack, depthIdMm, nominalWallThickness, plateLeft, plateWidth, idOriginY, isTopToe, isBottomToe, offsetMm]);

  // Generate OD Propagating Defect Curve (Penetrates from OD Right Edge towards ID)
  const odCrackPath = useMemo(() => {
    if (!hasOdCrack || depthOdMm === null) return null;
    const crackDepth = Math.max(1.0, Math.min(nominalWallThickness, depthOdMm));
    const crackDepthPx = (crackDepth / nominalWallThickness) * plateWidth;

    const startX = plateRight;
    const startY = odOriginY;
    const endX = plateRight - crackDepthPx;
    const endY = startY + (isTopToe ? 6 : -6);

    const cp1X = startX - crackDepthPx * 0.35;
    const cp1Y = startY - (isTopToe ? 5 : -5);
    const cp2X = startX - crackDepthPx * 0.70;
    const cp2Y = startY + (isTopToe ? 7 : -7);

    return {
      d: `M ${startX} ${startY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${endX} ${endY}`,
      tipX: endX,
      tipY: endY,
      originX: startX,
      originY: startY,
      depthMm: crackDepth,
      label: offsetMm > 0 ? `${offsetMm}mm OD ${isBottomToe ? 'BT' : 'TT'}` : `OD ${isBottomToe ? 'BT' : 'TT'}`,
    };
  }, [hasOdCrack, depthOdMm, nominalWallThickness, plateRight, plateWidth, odOriginY, isTopToe, isBottomToe, offsetMm]);

  // Sound Ligament Calculation (Remaining uncracked wall)
  const totalFlawPenetration = (hasIdCrack ? (depthIdMm || 0) : 0) + (hasOdCrack ? (depthOdMm || 0) : 0);
  const soundWallRemainingMm = Number(Math.max(0, nominalWallThickness - totalFlawPenetration).toFixed(1));

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const xPx = e.clientX - rect.left;
    const yPx = e.clientY - rect.top;

    if (
      xPx < plateLeft - 20 ||
      xPx > plateRight + 20 ||
      yPx < plateTop ||
      yPx > plateBottom
    ) {
      setHoverCursor(null);
      return;
    }

    const depthFromIdMm = Number(Math.max(0, Math.min(nominalWallThickness, invertX(xPx))).toFixed(1));
    const distanceFromOdMm = Number((nominalWallThickness - depthFromIdMm).toFixed(1));
    const offsetFromCenterlineMm = Number(invertY(yPx).toFixed(1));
    const percentOfWallThickness = Number(((depthFromIdMm / nominalWallThickness) * 100).toFixed(1));

    let zone = "Base Metal (SA-387)";
    if (depthFromIdMm <= 3.0) {
      zone = "Type 410S Stainless Clad";
    } else if (depthFromIdMm <= rootDepthMm) {
      if (Math.abs(offsetFromCenterlineMm) <= idBevelTopYMm * (1 - depthFromIdMm / rootDepthMm)) {
        zone = "ID Weld Metal";
      } else if (Math.abs(offsetFromCenterlineMm) <= idBevelTopYMm * 1.35) {
        zone = "ID Heat Affected Zone (HAZ)";
      }
    } else {
      const odFraction = (depthFromIdMm - rootDepthMm) / (nominalWallThickness - rootDepthMm);
      if (Math.abs(offsetFromCenterlineMm) <= odBevelTopYMm * odFraction) {
        zone = "OD Weld Metal";
      } else if (Math.abs(offsetFromCenterlineMm) <= odBevelTopYMm * odFraction + 3.5) {
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
              {indication.code} — Asymmetric Double-V Weld Cross-Section
            </h4>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-sky-100 text-sky-800 uppercase tracking-wide">
              {nominalWallThickness.toFixed(1)} mm Wall
            </span>
            {cladStatus && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${cladStatus === "INCLUDING" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                Clad: {cladStatus}
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Through-thickness slice showing ID (left) &amp; OD (right) surfaces • Position: <strong>{indication.weldPosition || "Weld Toe"}</strong>
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

      {/* SVG Canvas Matching the User's Engineering Double-V Reference Diagram */}
      <div className="relative border border-slate-300 rounded-lg overflow-hidden bg-white shadow-inner flex justify-center py-2">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full max-w-[460px] h-auto select-none cursor-crosshair overflow-visible"
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

          {/* Vessel Shell Plate: Tall Vertical Rectangle matching reference drawing */}
          <rect
            x={plateLeft}
            y={plateTop}
            width={plateWidth}
            height={plateHeight}
            fill="#ffffff"
            stroke="#0f172a"
            strokeWidth="3.5"
          />

          {/* Internal Stainless Steel Clad Layer (~3.0 mm on ID side) */}
          <rect
            x={plateLeft}
            y={plateTop}
            width={(3.0 / nominalWallThickness) * plateWidth}
            height={plateHeight}
            fill="#38bdf8"
            fillOpacity="0.10"
            stroke="#0284c7"
            strokeWidth="1"
            strokeDasharray="2 2"
          />
          <text
            x={plateLeft + (1.5 / nominalWallThickness) * plateWidth}
            y={plateTop + 22}
            textAnchor="middle"
            fontSize="8"
            fontWeight="bold"
            fill="#0284c7"
          >
            CLAD
          </text>

          {/* Asymmetric Double-V Weld Metal Fill (Grey Hourglass matching reference drawing) */}
          {/* Left / ID Bevel Triangle: from ID (plateLeft) to Root (rootX) */}
          <polygon
            points={`
              ${plateLeft},${idTtY}
              ${rootX},${weldCenterY - 3}
              ${rootX},${weldCenterY + 3}
              ${plateLeft},${idBtY}
            `}
            fill="#cbd5e1"
            stroke="#64748b"
            strokeWidth="1.2"
          />

          {/* Right / OD Bevel Triangle: from Root (rootX) to OD (plateRight) */}
          <polygon
            points={`
              ${rootX},${weldCenterY - 3}
              ${plateRight},${odTtY}
              ${plateRight},${odBtY}
              ${rootX},${weldCenterY + 3}
            `}
            fill="#cbd5e1"
            stroke="#64748b"
            strokeWidth="1.2"
          />

          {/* Root Face Vertical Line */}
          <line
            x1={rootX}
            y1={weldCenterY - 3}
            x2={rootX}
            y2={weldCenterY + 3}
            stroke="#475569"
            strokeWidth="1.5"
          />

          {/* ID & OD Surface Boundary Headers (Top outside plate - cleanly spaced with zero superposition) */}
          <g transform={`translate(${plateLeft}, ${plateTop - 18})`}>
            <rect
              x="-24"
              y="-14"
              width="48"
              height="24"
              rx="4"
              fill="#f8fafc"
              stroke="#cbd5e1"
              strokeWidth="1"
            />
            <text
              x="0"
              y="2"
              textAnchor="middle"
              fontSize="12"
              fontWeight="900"
              fontFamily="sans-serif"
              fill="#0f172a"
            >
              ID
            </text>
          </g>

          <g transform={`translate(${plateRight}, ${plateTop - 18})`}>
            <rect
              x="-24"
              y="-14"
              width="48"
              height="24"
              rx="4"
              fill="#f8fafc"
              stroke="#cbd5e1"
              strokeWidth="1"
            />
            <text
              x="0"
              y="2"
              textAnchor="middle"
              fontSize="12"
              fontWeight="900"
              fontFamily="sans-serif"
              fill="#0f172a"
            >
              OD
            </text>
          </g>

          {/* Green Horizontal Weld Centerline */}
          <line
            x1={plateLeft - 26}
            y1={weldCenterY}
            x2={plateRight + 44}
            y2={weldCenterY}
            stroke="#16a34a"
            strokeWidth="1.5"
            strokeDasharray="5 3"
          />

          {/* Weld Center Text Label reading horizontally on green centerline */}
          <text
            x={plateRight + 48}
            y={weldCenterY + 3.5}
            textAnchor="start"
            fontSize="10"
            fontFamily="sans-serif"
            fontWeight="700"
            fill="#16a34a"
          >
            Weld Center
          </text>

          {/* ID Landmarks: TT (Top Toe) and BT (Bottom Toe) - cleanly spaced at bevel coordinates */}
          <g className="id-landmarks">
            <line
              x1={plateLeft - 18}
              y1={idTtY}
              x2={plateLeft}
              y2={idTtY}
              stroke="#94a3b8"
              strokeWidth="1"
              strokeDasharray="2 2"
            />
            <text
              x={plateLeft - 22}
              y={idTtY + 4}
              textAnchor="end"
              fontSize="12"
              fontWeight="800"
              fontFamily="sans-serif"
              fill="#334155"
            >
              TT
            </text>

            <line
              x1={plateLeft - 18}
              y1={idBtY}
              x2={plateLeft}
              y2={idBtY}
              stroke="#94a3b8"
              strokeWidth="1"
              strokeDasharray="2 2"
            />
            <text
              x={plateLeft - 22}
              y={idBtY + 4}
              textAnchor="end"
              fontSize="12"
              fontWeight="800"
              fontFamily="sans-serif"
              fill="#334155"
            >
              BT
            </text>
          </g>

          {/* OD Landmarks: TT (Top Toe) and BT (Bottom Toe) - cleanly spaced at bevel coordinates */}
          <g className="od-landmarks">
            <line
              x1={plateRight}
              y1={odTtY}
              x2={plateRight + 18}
              y2={odTtY}
              stroke="#94a3b8"
              strokeWidth="1"
              strokeDasharray="2 2"
            />
            <text
              x={plateRight + 22}
              y={odTtY + 4}
              textAnchor="start"
              fontSize="12"
              fontWeight="800"
              fontFamily="sans-serif"
              fill="#334155"
            >
              TT
            </text>

            <line
              x1={plateRight}
              y1={odBtY}
              x2={plateRight + 18}
              y2={odBtY}
              stroke="#94a3b8"
              strokeWidth="1"
              strokeDasharray="2 2"
            />
            <text
              x={plateRight + 22}
              y={odBtY + 4}
              textAnchor="start"
              fontSize="12"
              fontWeight="800"
              fontFamily="sans-serif"
              fill="#334155"
            >
              BT
            </text>
          </g>

          {/* 1. Propagating ID Crack (Initiates at ID left surface, penetrates towards OD) */}
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

              {/* ID Crack Depth Callout Annotation */}
              <g transform={`translate(${Math.min(width - 155, idCrackPath.tipX + 12)}, ${idCrackPath.tipY - 14})`}>
                <rect
                  x="0"
                  y="0"
                  width="142"
                  height="22"
                  rx="4"
                  fill="#ffffff"
                  fillOpacity="0.95"
                  stroke="#e2e8f0"
                  strokeWidth="1"
                />
                <text
                  x="71"
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
          )}

          {/* 2. Propagating OD Crack/Flaw (Initiates at OD right surface, penetrates towards ID) */}
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

              {/* OD Crack Depth Callout Annotation */}
              <g transform={`translate(${Math.max(10, odCrackPath.tipX - 145)}, ${odCrackPath.tipY + 8})`}>
                <rect
                  x="0"
                  y="0"
                  width="142"
                  height="22"
                  rx="4"
                  fill="#ffffff"
                  fillOpacity="0.95"
                  stroke="#e2e8f0"
                  strokeWidth="1"
                />
                <text
                  x="71"
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
          )}

          {/* Horizontal Thickness Dimension Ruler at bottom */}
          <g transform={`translate(0, ${plateBottom + 26})`}>
            <line
              x1={plateLeft}
              y1="0"
              x2={plateRight}
              y2="0"
              stroke="#475569"
              strokeWidth="1.2"
            />
            <line x1={plateLeft} y1="-5" x2={plateLeft} y2="5" stroke="#475569" strokeWidth="1.2" />
            <line x1={plateRight} y1="-5" x2={plateRight} y2="5" stroke="#475569" strokeWidth="1.2" />
            <text
              x={(plateLeft + plateRight) / 2}
              y="16"
              textAnchor="middle"
              fontSize="10.5"
              fontWeight="bold"
              fontFamily="sans-serif"
              fill="#334155"
            >
              Nominal Wall Thickness: {nominalWallThickness.toFixed(1)} mm
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

