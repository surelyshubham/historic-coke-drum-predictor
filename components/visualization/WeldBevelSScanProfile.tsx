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

  // SVG Geometry for Vertical Through-Thickness Slice
  const width = 680;
  const height = 480;
  const margin = { top: 35, right: 90, bottom: 45, left: 90 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  // Coordinate System:
  // Horizontal (X): Through-Wall Thickness from ID (0 mm) to OD (nominalWallThickness, default 32 mm)
  // Vertical (Y): Height along vessel shell (-45 mm to +45 mm, where 0 mm = Weld Centerline)
  const xMin = 0;
  const xMax = nominalWallThickness;
  const yMin = -45; // Bottom (-45 mm)
  const yMax = 45;  // Top (+45 mm)

  const scaleX = (val: number) => {
    return margin.left + ((val - xMin) / (xMax - xMin)) * innerWidth;
  };

  const scaleY = (val: number) => {
    // Invert Y so +45 (Top) is at the top of SVG, -45 (Bottom) is at the bottom
    return margin.top + ((yMax - val) / (yMax - yMin)) * innerHeight;
  };

  const invertX = (xPx: number) => {
    return xMin + ((xPx - margin.left) / innerWidth) * (xMax - xMin);
  };

  const invertY = (yPx: number) => {
    return yMax - ((yPx - margin.top) / innerHeight) * (yMax - yMin);
  };

  // Double-V Bevel Geometry Points (matching user reference diagram):
  // ID side (Left, x = 0 mm):
  // Root face at x ≈ 11.5 mm, y = 0
  // ID Top Toe (TT): x = 0 mm, y = +10.0 mm
  // ID Bottom Toe (BT): x = 0 mm, y = -10.0 mm
  // Root junction: x = 11.5 mm, y = 0 mm (narrower ID bevel)
  //
  // OD side (Right, x = 32 mm):
  // OD Top Toe (TT): x = 32 mm, y = +18.0 mm
  // OD Bottom Toe (BT): x = 32 mm, y = -18.0 mm
  // Root junction: x = 11.5 mm, y = 0 mm (wider OD bevel)
  const rootX = 11.5;
  const idBevelTopY = 10.0;
  const idBevelBottomY = -10.0;
  const odBevelTopY = 18.0;
  const odBevelBottomY = -18.0;

  // Defect parameters from indication
  const crackDepthMm = Math.max(1.5, Math.min(nominalWallThickness - 1, indication.latestDepth || 5.6));
  const isTopToe = (indication.weldPosition || "").toUpperCase().includes("TT") || !(indication.weldPosition || "").toUpperCase().includes("BT");
  const isOdInitiated = (indication.weldPosition || "").toUpperCase().includes("OD");

  // Generate the organic propagating crack curve (Red wavy line)
  const crackCurvePath = useMemo(() => {
    if (!isOdInitiated) {
      // Initiates at ID Top Toe (or Bottom Toe) and propagates toward OD
      const startX = 0; // ID surface
      const startY = isTopToe ? idBevelTopY : idBevelBottomY;
      const targetDepth = crackDepthMm; // e.g. 5.6 mm or 12 mm

      // Wave path points
      const cp1X = startX + targetDepth * 0.35;
      const cp1Y = startY + (isTopToe ? 2.2 : -2.2);
      const cp2X = startX + targetDepth * 0.70;
      const cp2Y = startY + (isTopToe ? -1.5 : 1.5);
      const endX = startX + targetDepth;
      const endY = startY + (isTopToe ? 0.5 : -0.5);

      return {
        d: `M ${scaleX(startX)} ${scaleY(startY)} C ${scaleX(cp1X)} ${scaleY(cp1Y)}, ${scaleX(cp2X)} ${scaleY(cp2Y)}, ${scaleX(endX)} ${scaleY(endY)}`,
        tipX: endX,
        tipY: endY,
        originX: startX,
        originY: startY,
        originLabel: isTopToe ? "ID Top Toe (TT)" : "ID Bottom Toe (BT)",
      };
    } else {
      // Initiates at OD
      const startX = nominalWallThickness;
      const startY = isTopToe ? odBevelTopY : odBevelBottomY;
      const targetDepth = crackDepthMm;

      const cp1X = startX - targetDepth * 0.35;
      const cp1Y = startY + (isTopToe ? 2.0 : -2.0);
      const cp2X = startX - targetDepth * 0.70;
      const cp2Y = startY + (isTopToe ? -1.5 : 1.5);
      const endX = startX - targetDepth;
      const endY = startY + (isTopToe ? 0.4 : -0.4);

      return {
        d: `M ${scaleX(startX)} ${scaleY(startY)} C ${scaleX(cp1X)} ${scaleY(cp1Y)}, ${scaleX(cp2X)} ${scaleY(cp2Y)}, ${scaleX(endX)} ${scaleY(endY)}`,
        tipX: endX,
        tipY: endY,
        originX: startX,
        originY: startY,
        originLabel: isTopToe ? "OD Top Toe (TT)" : "OD Bottom Toe (BT)",
      };
    }
  }, [crackDepthMm, isTopToe, isOdInitiated, idBevelTopY, idBevelBottomY, odBevelTopY, odBevelBottomY, nominalWallThickness]);

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

    const depthFromIdMm = Number(Math.max(0, Math.min(nominalWallThickness, invertX(xPx))).toFixed(2));
    const distanceFromOdMm = Number((nominalWallThickness - depthFromIdMm).toFixed(2));
    const offsetFromCenterlineMm = Number(invertY(yPx).toFixed(2));
    const percentOfWallThickness = Number(((depthFromIdMm / nominalWallThickness) * 100).toFixed(1));
    const remainingWallMm = Number(Math.max(0, nominalWallThickness - crackDepthMm).toFixed(1));

    let zone = "Base Metal";
    if (depthFromIdMm <= rootX) {
      if (Math.abs(offsetFromCenterlineMm) <= idBevelTopY * (1 - depthFromIdMm / rootX)) {
        zone = "ID Weld Metal";
      } else if (Math.abs(offsetFromCenterlineMm) <= idBevelTopY * 1.3) {
        zone = "ID Heat Affected Zone (HAZ)";
      }
    } else {
      const odFraction = (depthFromIdMm - rootX) / (nominalWallThickness - rootX);
      if (Math.abs(offsetFromCenterlineMm) <= odBevelTopY * odFraction) {
        zone = "OD Weld Metal";
      } else if (Math.abs(offsetFromCenterlineMm) <= odBevelTopY * odFraction + 4) {
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
          className="w-full max-w-[660px] h-auto select-none cursor-crosshair overflow-visible"
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

          {/* Vessel Shell Wall Solid Black Boundaries */}
          {/* Top Wall Cap line */}
          <line
            x1={scaleX(xMin)}
            y1={scaleY(yMax)}
            x2={scaleX(xMax)}
            y2={scaleY(yMax)}
            stroke="#0f172a"
            strokeWidth="3.5"
          />
          {/* Bottom Wall Cap line */}
          <line
            x1={scaleX(xMin)}
            y1={scaleY(yMin)}
            x2={scaleX(xMax)}
            y2={scaleY(yMin)}
            stroke="#0f172a"
            strokeWidth="3.5"
          />

          {/* ID Surface Line (Left boundary) */}
          <line
            x1={scaleX(xMin)}
            y1={scaleY(yMin)}
            x2={scaleX(xMin)}
            y2={scaleY(yMax)}
            stroke="#0f172a"
            strokeWidth="3.5"
          />

          {/* OD Surface Line (Right boundary) */}
          <line
            x1={scaleX(xMax)}
            y1={scaleY(yMin)}
            x2={scaleX(xMax)}
            y2={scaleY(yMax)}
            stroke="#0f172a"
            strokeWidth="3.5"
          />

          {/* Asymmetric Double-V Weld Metal Fill (Grey Hourglass Shape matching user diagram) */}
          {/* Left / ID Bevel Triangle: (0, idBevelBottomY) -> (rootX, 0) -> (0, idBevelTopY) */}
          <polygon
            points={`
              ${scaleX(0)},${scaleY(idBevelBottomY)}
              ${scaleX(rootX)},${scaleY(0)}
              ${scaleX(0)},${scaleY(idBevelTopY)}
            `}
            fill="#cbd5e1"
            stroke="#64748b"
            strokeWidth="1.2"
          />

          {/* Right / OD Bevel Triangle: (nominalWallThickness, odBevelBottomY) -> (rootX, 0) -> (nominalWallThickness, odBevelTopY) */}
          <polygon
            points={`
              ${scaleX(nominalWallThickness)},${scaleY(odBevelBottomY)}
              ${scaleX(rootX)},${scaleY(0)}
              ${scaleX(nominalWallThickness)},${scaleY(odBevelTopY)}
            `}
            fill="#cbd5e1"
            stroke="#64748b"
            strokeWidth="1.2"
          />

          {/* Green Horizontal Weld Centerline */}
          <line
            x1={scaleX(xMin) - 30}
            y1={scaleY(0)}
            x2={scaleX(xMax) + 30}
            y2={scaleY(0)}
            stroke="#86efac"
            strokeWidth="1.2"
          />

          {/* Weld Center Text Label at right edge */}
          <text
            x={scaleX(xMax) + 35}
            y={scaleY(0) + 3.5}
            textAnchor="start"
            fontSize="10"
            fontFamily="sans-serif"
            fill="#64748b"
            transform={`rotate(90, ${scaleX(xMax) + 35}, ${scaleY(0)})`}
          >
            Weld Center
          </text>

          {/* ID Surface Label */}
          <text
            x={scaleX(xMin) - 16}
            y={scaleY(20)}
            textAnchor="end"
            fontSize="13"
            fontWeight="bold"
            fontFamily="sans-serif"
            fill="#0f172a"
          >
            ID
          </text>

          {/* OD Surface Label */}
          <text
            x={scaleX(xMax) + 16}
            y={scaleY(20)}
            textAnchor="start"
            fontSize="13"
            fontWeight="bold"
            fontFamily="sans-serif"
            fill="#0f172a"
          >
            OD
          </text>

          {/* ID Landmarks: TT (Top Toe) and BT (Bottom Toe) */}
          <text
            x={scaleX(xMin) - 12}
            y={scaleY(idBevelTopY) + 3.5}
            textAnchor="end"
            fontSize="12"
            fontWeight="600"
            fontFamily="sans-serif"
            fill="#0f172a"
          >
            TT
          </text>
          <text
            x={scaleX(xMin) - 12}
            y={scaleY(idBevelBottomY) + 3.5}
            textAnchor="end"
            fontSize="12"
            fontWeight="600"
            fontFamily="sans-serif"
            fill="#0f172a"
          >
            BT
          </text>

          {/* OD Landmarks: TT (Top Toe) and BT (Bottom Toe) */}
          <text
            x={scaleX(xMax) + 12}
            y={scaleY(odBevelTopY) + 3.5}
            textAnchor="start"
            fontSize="12"
            fontWeight="600"
            fontFamily="sans-serif"
            fill="#0f172a"
          >
            TT
          </text>
          <text
            x={scaleX(xMax) + 12}
            y={scaleY(odBevelBottomY) + 3.5}
            textAnchor="start"
            fontSize="12"
            fontWeight="600"
            fontFamily="sans-serif"
            fill="#0f172a"
          >
            BT
          </text>

          {/* Propagating Crack (Red Wavy Curve matching user diagram) */}
          <g className="propagating-crack">
            {/* Glow backing */}
            <path
              d={crackCurvePath.d}
              fill="none"
              stroke="#fca5a5"
              strokeWidth="6"
              strokeLinecap="round"
              strokeOpacity="0.4"
            />
            {/* Main Red Crack Path */}
            <path
              d={crackCurvePath.d}
              fill="none"
              stroke="#dc2626"
              strokeWidth="2.8"
              strokeLinecap="round"
            />

            {/* Crack Origin Dot */}
            <circle
              cx={scaleX(crackCurvePath.originX)}
              cy={scaleY(crackCurvePath.originY)}
              r="3.5"
              fill="#b91c1c"
            />

            {/* Ultrasonic Amplitude Echo Heatmap at Crack Tip */}
            <circle
              cx={scaleX(crackCurvePath.tipX)}
              cy={scaleY(crackCurvePath.tipY)}
              r="14"
              fill={`url(#crackTipJet-${indication.code})`}
            />
            {/* Sharp Crack Tip Hotspot */}
            <circle
              cx={scaleX(crackCurvePath.tipX)}
              cy={scaleY(crackCurvePath.tipY)}
              r="3"
              fill="#991b1b"
            />
          </g>

          {/* Crack Depth Callout Annotation */}
          <g transform={`translate(${scaleX(crackCurvePath.tipX) + 12}, ${scaleY(crackCurvePath.tipY) - 10})`}>
            <rect
              x="-4"
              y="-12"
              width="110"
              height="20"
              rx="4"
              fill="#ffffff"
              fillOpacity="0.92"
              stroke="#e2e8f0"
            />
            <text
              x="2"
              y="2"
              fontSize="10"
              fontWeight="bold"
              fontFamily="sans-serif"
              fill="#dc2626"
            >
              Crack Tip: {crackDepthMm.toFixed(1)} mm
            </text>
          </g>

          {/* Horizontal Thickness Dimension Ruler at bottom */}
          <g transform={`translate(0, ${scaleY(yMin) + 20})`}>
            <line
              x1={scaleX(xMin)}
              y1="0"
              x2={scaleX(xMax)}
              y2="0"
              stroke="#475569"
              strokeWidth="1"
            />
            <line x1={scaleX(xMin)} y1="-4" x2={scaleX(xMin)} y2="4" stroke="#475569" strokeWidth="1" />
            <line x1={scaleX(xMax)} y1="-4" x2={scaleX(xMax)} y2="4" stroke="#475569" strokeWidth="1" />
            <text
              x={(scaleX(xMin) + scaleX(xMax)) / 2}
              y="-6"
              textAnchor="middle"
              fontSize="10"
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
                y1={scaleY(yMax)}
                x2={hoverCursor.xPx}
                y2={scaleY(yMin)}
                stroke="#64748b"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              <line
                x1={scaleX(xMin)}
                y1={hoverCursor.yPx}
                x2={scaleX(xMax)}
                y2={hoverCursor.yPx}
                stroke="#64748b"
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

