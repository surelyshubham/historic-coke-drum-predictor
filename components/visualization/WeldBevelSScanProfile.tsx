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

  const svgRef = useRef<SVGSVGElement | null>(null);

  // SVG Geometry for Tall Vertical Through-Thickness Slice
  // Matches authentic engineering reference drawing (media_1788721266007.png)
  const width = 460;
  const height = 640;

  // Tall vertical plate slice representing vessel shell wall
  const plateWidth = 170; // Represents nominalWallThickness (default 32.0 mm)
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

  // Double-V Bevel Geometry (matching user reference drawing media_1788721266007.png):
  // Root face at ~11.5 mm from ID
  const rootDepthMm = 11.5;
  const rootX = scaleX(rootDepthMm); // ~206 px

  // ID Side (Left): Narrower and shorter bevel
  // Top Toe (TT): y = +11 mm (~50 px above center)
  // Bottom Toe (BT): y = -11 mm (~50 px below center)
  const idBevelTopYMm = 11.0;
  const idBevelBottomYMm = -11.0;
  const idTtY = scaleY(idBevelTopYMm);
  const idBtY = scaleY(idBevelBottomYMm);

  // OD Side (Right): Wider and taller bevel
  // Top Toe (TT): y = +22 mm (~100 px above center)
  // Bottom Toe (BT): y = -22 mm (~100 px below center)
  const odBevelTopYMm = 22.0;
  const odBevelBottomYMm = -22.0;
  const odTtY = scaleY(odBevelTopYMm);
  const odBtY = scaleY(odBevelBottomYMm);

  // Defect parameters from indication
  const crackDepthMm = Math.max(1.0, Math.min(nominalWallThickness, indication.latestDepth || 5.6));
  const isTopToe = (indication.weldPosition || "").toUpperCase().includes("TT") || !(indication.weldPosition || "").toUpperCase().includes("BT");
  const isOdInitiated = (indication.weldPosition || "").toUpperCase().includes("OD");

  // Generate the organic propagating crack curve (Red wavy line) strictly scaled by depth
  const crackCurvePath = useMemo(() => {
    const crackDepthPx = (crackDepthMm / nominalWallThickness) * plateWidth;

    if (!isOdInitiated) {
      // Initiates at ID Top Toe (or Bottom Toe) on the left surface and propagates horizontally rightwards toward OD
      const startX = plateLeft;
      const startY = isTopToe ? idTtY : idBtY;
      const endX = plateLeft + crackDepthPx;
      const endY = startY + (isTopToe ? 6 : -6);

      // Natural propagating crack waviness through HAZ
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
        originLabel: isTopToe ? "ID Top Toe (TT)" : "ID Bottom Toe (BT)",
      };
    } else {
      // Initiates at OD Top Toe (or Bottom Toe) on the right surface and propagates horizontally leftwards toward ID
      const startX = plateRight;
      const startY = isTopToe ? odTtY : odBtY;
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
        originLabel: isTopToe ? "OD Top Toe (TT)" : "OD Bottom Toe (BT)",
      };
    }
  }, [crackDepthMm, isTopToe, isOdInitiated, idTtY, idBtY, odTtY, odBtY, plateLeft, plateRight, plateWidth, nominalWallThickness]);

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
    const remainingWallMm = Number(Math.max(0, nominalWallThickness - crackDepthMm).toFixed(1));

    let zone = "Base Metal (SA-387)";
    if (depthFromIdMm <= rootDepthMm) {
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
      remainingWallMm,
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
          <h4 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <span>{indication.code} — Asymmetric Double-V Weld Cross-Section</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-sky-100 text-sky-800 uppercase tracking-wide">
              Full {nominalWallThickness.toFixed(1)} mm Wall
            </span>
          </h4>
          <p className="text-[11px] text-slate-500">
            Through-thickness slice showing ID/OD surfaces, Double-V bevel, and {crackCurvePath.originLabel} crack propagation
          </p>
        </div>

        {/* Live Coordinate Readout Ribbon */}
        <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-xs">
          {hoverCursor ? (
            <>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400 font-medium">Depth from ID:</span>
                <span className="font-mono font-bold text-sky-800">{hoverCursor.depthFromIdMm} mm</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-sky-100 text-sky-800 font-semibold">
                  {hoverCursor.percentOfWallThickness}%
                </span>
              </div>
              <span className="text-slate-300">|</span>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400 font-medium">Offset:</span>
                <span className="font-mono font-bold text-slate-900">
                  {hoverCursor.offsetFromCenterlineMm > 0 ? `+${hoverCursor.offsetFromCenterlineMm}` : hoverCursor.offsetFromCenterlineMm} mm
                </span>
              </div>
              <span className="text-slate-300">|</span>
              <div className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                <span className="text-slate-400 font-normal">Zone:</span>
                <span>{hoverCursor.zone}</span>
              </div>
            </>
          ) : (
            <span className="text-slate-400 italic text-[11px] flex items-center gap-1.5">
              <span>🎯 Move cursor across the 32 mm cross-section to measure depth and remaining ligament</span>
            </span>
          )}
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

          {/* Green Horizontal Weld Centerline */}
          <line
            x1={plateLeft - 26}
            y1={weldCenterY}
            x2={plateRight + 36}
            y2={weldCenterY}
            stroke="#86efac"
            strokeWidth="1.5"
          />

          {/* Weld Center Text Label reading downwards along right edge */}
          <text
            x={plateRight + 44}
            y={weldCenterY - 28}
            textAnchor="start"
            fontSize="10.5"
            fontFamily="sans-serif"
            fontWeight="600"
            fill="#64748b"
            transform={`rotate(90, ${plateRight + 44}, ${weldCenterY - 28})`}
          >
            Weld Center
          </text>

          {/* ID Surface Label (Upper left outside plate) */}
          <text
            x={plateLeft - 14}
            y={weldCenterY - 95}
            textAnchor="end"
            fontSize="15"
            fontWeight="900"
            fontFamily="sans-serif"
            fill="#0f172a"
          >
            ID
          </text>

          {/* OD Surface Label (Upper right outside plate) */}
          <text
            x={plateRight + 14}
            y={weldCenterY - 95}
            textAnchor="start"
            fontSize="15"
            fontWeight="900"
            fontFamily="sans-serif"
            fill="#0f172a"
          >
            OD
          </text>

          {/* ID Landmarks: TT (Top Toe) and BT (Bottom Toe) */}
          <text
            x={plateLeft - 8}
            y={idTtY + 4}
            textAnchor="end"
            fontSize="13"
            fontWeight="700"
            fontFamily="sans-serif"
            fill="#0f172a"
          >
            TT
          </text>
          <text
            x={plateLeft - 8}
            y={idBtY + 4}
            textAnchor="end"
            fontSize="13"
            fontWeight="700"
            fontFamily="sans-serif"
            fill="#0f172a"
          >
            BT
          </text>

          {/* OD Landmarks: TT (Top Toe) and BT (Bottom Toe) */}
          <text
            x={plateRight + 8}
            y={odTtY + 4}
            textAnchor="start"
            fontSize="13"
            fontWeight="700"
            fontFamily="sans-serif"
            fill="#0f172a"
          >
            TT
          </text>
          <text
            x={plateRight + 8}
            y={odBtY + 4}
            textAnchor="start"
            fontSize="13"
            fontWeight="700"
            fontFamily="sans-serif"
            fill="#0f172a"
          >
            BT
          </text>

          {/* Propagating Crack (Red Wavy Curve strictly scaled by depth) */}
          <g className="propagating-crack">
            {/* Glow backing */}
            <path
              d={crackCurvePath.d}
              fill="none"
              stroke="#fca5a5"
              strokeWidth="6"
              strokeLinecap="round"
              strokeOpacity="0.45"
            />
            {/* Main Red Crack Path */}
            <path
              d={crackCurvePath.d}
              fill="none"
              stroke="#dc2626"
              strokeWidth="3.2"
              strokeLinecap="round"
            />

            {/* Crack Origin Dot */}
            <circle
              cx={crackCurvePath.originX}
              cy={crackCurvePath.originY}
              r="3.5"
              fill="#b91c1c"
            />

            {/* Ultrasonic Amplitude Echo Heatmap at Crack Tip */}
            <circle
              cx={crackCurvePath.tipX}
              cy={crackCurvePath.tipY}
              r="14"
              fill={`url(#crackTipJet-${indication.code})`}
            />
            {/* Sharp Crack Tip Hotspot */}
            <circle
              cx={crackCurvePath.tipX}
              cy={crackCurvePath.tipY}
              r="3"
              fill="#991b1b"
            />
          </g>

          {/* Crack Depth Callout Annotation */}
          <g
            transform={`translate(${
              isOdInitiated
                ? Math.max(10, crackCurvePath.tipX - 145)
                : Math.min(width - 155, crackCurvePath.tipX + 12)
            }, ${crackCurvePath.tipY - 14})`}
          >
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
              Crack Tip: {crackDepthMm.toFixed(1)} mm ({((crackDepthMm / nominalWallThickness) * 100).toFixed(0)}%)
            </text>
          </g>

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
              minWidth: "230px",
            }}
          >
            <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-200">
              <span className="font-bold text-slate-900">Through-Wall Slice</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-sky-100 text-sky-800">
                {hoverCursor.percentOfWallThickness}% Depth
              </span>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Depth from ID:</span>
                <span className="font-mono font-bold text-sky-800">{hoverCursor.depthFromIdMm} mm</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Distance from OD:</span>
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
              <div className="pt-1.5 border-t border-slate-100 flex justify-between">
                <span className="text-slate-500">Remaining Sound Wall:</span>
                <span className="font-bold text-emerald-700 font-mono">
                  {(nominalWallThickness - crackDepthMm).toFixed(1)} mm
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Cross-Section Engineering Metadata */}
      <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-600 pt-1 border-t border-slate-100">
        <div className="flex items-center gap-4">
          <span>Crack Origin: <strong className="text-red-700">{crackCurvePath.originLabel}</strong></span>
          <span>Measured Depth: <strong className="text-red-700">{crackDepthMm.toFixed(1)} mm</strong> ({((crackDepthMm / nominalWallThickness) * 100).toFixed(1)}% of wall)</span>
          <span>Sound Ligament: <strong className="text-emerald-700 font-mono">{(nominalWallThickness - crackDepthMm).toFixed(1)} mm</strong></span>
        </div>
        <span className="text-slate-400 italic">Asymmetric Double-V (X-Groove) • Weld Center 0 mm</span>
      </div>
    </div>
  );
}

