"use client";

import { useState, useRef, useMemo } from "react";
import { TrackedPhysicalIndication } from "@/lib/import/matrixParser";

interface WeldBevelSScanProfileProps {
  indication: TrackedPhysicalIndication;
  nominalWallThickness?: number; // default 32 mm
  maxDisplayDepthMm?: number; // default 6 mm (matching Image 3 depth 0-5.5mm)
}

export function WeldBevelSScanProfile({
  indication,
  nominalWallThickness = 32.0,
  maxDisplayDepthMm = 6.0,
}: WeldBevelSScanProfileProps) {
  const [hoverCursor, setHoverCursor] = useState<{
    xPx: number;
    yPx: number;
    depthMm: number;
    offsetMm: number;
    percentOfWallThickness: number;
    remainingWallMm: number;
    distanceToCenterlineMm: number;
  } | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);

  // SVG Geometry
  const width = 760;
  const height = 280;
  const margin = { top: 25, right: 35, bottom: 50, left: 60 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  // X range (-15 mm to +13 mm)
  const xMin = -15;
  const xMax = 13;
  // Y range (0 mm to maxDisplayDepthMm, inverted so 0 is at the top)
  const yMin = 0;
  const yMax = maxDisplayDepthMm;

  const scaleX = (val: number) => {
    return margin.left + ((val - xMin) / (xMax - xMin)) * innerWidth;
  };

  const scaleY = (val: number) => {
    return margin.top + ((val - yMin) / (yMax - yMin)) * innerHeight;
  };

  const invertX = (xPx: number) => {
    return xMin + ((xPx - margin.left) / innerWidth) * (xMax - xMin);
  };

  const invertY = (yPx: number) => {
    return yMin + ((yPx - margin.top) / innerHeight) * (yMax - yMin);
  };

  // Compute defect echo center
  const defectDepth = Math.max(1.2, Math.min(yMax - 0.4, indication.latestDepth || 4.0));
  const defectOffset = useMemo(() => {
    const text = (indication.weldPosition || "").toUpperCase();
    if (text.includes("BT")) return -0.8;
    if (text.includes("TT")) return 0.6;
    return -0.2;
  }, [indication]);

  // Weld Bevel Profile Points (V-Groove geometry matching Image 3)
  // Purple dashed lines (Fusion Lines):
  // Top: x = -3 at y = 0 to 1.3, then slopes inward to x = -0.5 at y = 5.0
  // Right: x = +3 at y = 0 to 1.3, then slopes inward to x = +0.8 at y = 5.0
  const bevelLeftPoints = [
    { x: -3.0, y: 0.0 },
    { x: -3.0, y: 1.4 },
    { x: -0.6, y: 5.4 },
  ];
  const bevelRightPoints = [
    { x: 3.0, y: 0.0 },
    { x: 3.0, y: 1.4 },
    { x: 1.0, y: 5.4 },
  ];

  // Grey dashed lines (HAZ / Prep boundary):
  // Left: x = -6.0 at y = 0 to 1.3, slopes to x = -3.8 at y = 5.4
  // Right: x = 6.0 at y = 0 to 1.3, slopes to x = 4.0 at y = 5.4
  const hazLeftPoints = [
    { x: -6.0, y: 0.0 },
    { x: -6.0, y: 1.4 },
    { x: -3.8, y: 5.4 },
  ];
  const hazRightPoints = [
    { x: 6.0, y: 0.0 },
    { x: 6.0, y: 1.4 },
    { x: 4.0, y: 5.4 },
  ];

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

    const depthMm = Number(Math.max(0, invertY(yPx)).toFixed(2));
    const offsetMm = Number(invertX(xPx).toFixed(2));
    const percentOfWallThickness = Number(((depthMm / nominalWallThickness) * 100).toFixed(1));
    const remainingWallMm = Number(Math.max(0, nominalWallThickness - depthMm).toFixed(1));
    const distanceToCenterlineMm = Number(Math.abs(offsetMm).toFixed(2));

    setHoverCursor({
      xPx,
      yPx,
      depthMm,
      offsetMm,
      percentOfWallThickness,
      remainingWallMm,
      distanceToCenterlineMm,
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
          <h4 className="text-sm font-bold text-amber-950 tracking-tight">
            {indication.code} ({indication.latestLength} MM) — Cross-Sectional Bevel Profile
          </h4>
          <p className="text-[11px] text-slate-500">
            Transverse S-Scan ultrasonic echo through-wall slice at weld joint {indication.weldName}
          </p>
        </div>

        {/* Live Coordinate Readout Ribbon (Always unobscured above the bevel profile) */}
        <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-xs">
          {hoverCursor ? (
            <>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400 font-medium">Depth:</span>
                <span className="font-mono font-bold text-sky-800">{hoverCursor.depthMm} mm</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-sky-100 text-sky-800 font-semibold">
                  {hoverCursor.percentOfWallThickness}% of Wall
                </span>
              </div>
              <span className="text-slate-300">|</span>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400 font-medium">Offset:</span>
                <span className="font-mono font-bold text-slate-900">
                  {hoverCursor.offsetMm > 0 ? `+${hoverCursor.offsetMm}` : hoverCursor.offsetMm} mm
                </span>
              </div>
              <span className="text-slate-300">|</span>
              <div className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                <span className="text-slate-400 font-normal">Sound Wall:</span>
                <span className="font-mono">{hoverCursor.remainingWallMm} mm</span>
              </div>
            </>
          ) : (
            <span className="text-slate-400 italic text-[11px] flex items-center gap-1.5">
              <span>🎯 Move cursor across cross-section to measure depth and remaining ligament</span>
            </span>
          )}
        </div>
      </div>

      {/* SVG Canvas with Ultrasonic Heatmap Echo and Floating Cursor */}
      <div className="relative border border-slate-300 rounded-lg overflow-hidden bg-[#f8fafc] shadow-inner">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto select-none cursor-crosshair"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <defs>
            {/* Ultrasonic Jet/Rainbow Colormap Gradient */}
            <radialGradient id={`ultrasonicJet-${indication.code}`} cx="45%" cy="40%" r="55%">
              <stop offset="0%" stopColor="#b91c1c" stopOpacity="0.95" /> {/* Peak core: Dark Red */}
              <stop offset="25%" stopColor="#ea580c" stopOpacity="0.90" /> {/* Hot core: Orange */}
              <stop offset="50%" stopColor="#eab308" stopOpacity="0.85" /> {/* Yellow */}
              <stop offset="70%" stopColor="#16a34a" stopOpacity="0.75" /> {/* Green */}
              <stop offset="88%" stopColor="#0284c7" stopOpacity="0.60" /> {/* Cyan / Blue */}
              <stop offset="100%" stopColor="#1e3a8a" stopOpacity="0.0" /> {/* Transparent Edge */}
            </radialGradient>
          </defs>

          {/* Plot Area Outer Border */}
          <rect
            x={margin.left}
            y={margin.top}
            width={innerWidth}
            height={innerHeight}
            fill="#f8fafc"
            stroke="#94a3b8"
            strokeWidth="1.2"
          />

          {/* Weld Centerline (Green dashed line at 0 mm) */}
          <line
            x1={scaleX(0)}
            y1={margin.top}
            x2={scaleX(0)}
            y2={margin.top + innerHeight}
            stroke="#22c55e"
            strokeWidth="1.5"
            strokeDasharray="6 3 2 3"
          />

          {/* Weld Bevel Fusion Lines (Purple dashed angled lines) */}
          <path
            d={`M ${scaleX(bevelLeftPoints[0].x)} ${scaleY(bevelLeftPoints[0].y)} L ${scaleX(bevelLeftPoints[1].x)} ${scaleY(bevelLeftPoints[1].y)} L ${scaleX(bevelLeftPoints[2].x)} ${scaleY(bevelLeftPoints[2].y)}`}
            fill="none"
            stroke="#7e22ce"
            strokeWidth="1.6"
            strokeDasharray="5 3"
          />
          <path
            d={`M ${scaleX(bevelRightPoints[0].x)} ${scaleY(bevelRightPoints[0].y)} L ${scaleX(bevelRightPoints[1].x)} ${scaleY(bevelRightPoints[1].y)} L ${scaleX(bevelRightPoints[2].x)} ${scaleY(bevelRightPoints[2].y)}`}
            fill="none"
            stroke="#7e22ce"
            strokeWidth="1.6"
            strokeDasharray="5 3"
          />

          {/* Heat Affected Zone (HAZ) Boundaries (Grey dashed angled lines) */}
          <path
            d={`M ${scaleX(hazLeftPoints[0].x)} ${scaleY(hazLeftPoints[0].y)} L ${scaleX(hazLeftPoints[1].x)} ${scaleY(hazLeftPoints[1].y)} L ${scaleX(hazLeftPoints[2].x)} ${scaleY(hazLeftPoints[2].y)}`}
            fill="none"
            stroke="#64748b"
            strokeWidth="1.4"
            strokeDasharray="4 4"
          />
          <path
            d={`M ${scaleX(hazRightPoints[0].x)} ${scaleY(hazRightPoints[0].y)} L ${scaleX(hazRightPoints[1].x)} ${scaleY(hazRightPoints[1].y)} L ${scaleX(hazRightPoints[2].x)} ${scaleY(hazRightPoints[2].y)}`}
            fill="none"
            stroke="#64748b"
            strokeWidth="1.4"
            strokeDasharray="4 4"
          />

          {/* Ultrasonic Echo Cluster (Phased array heatmap matching Image 3) */}
          <g className="ultrasonic-echo">
            {/* Tilted outer envelope */}
            <ellipse
              cx={scaleX(defectOffset)}
              cy={scaleY(defectDepth)}
              rx="16"
              ry="26"
              fill={`url(#ultrasonicJet-${indication.code})`}
              transform={`rotate(-12, ${scaleX(defectOffset)}, ${scaleY(defectDepth)})`}
            />
            {/* High amplitude hotspot */}
            <circle
              cx={scaleX(defectOffset)}
              cy={scaleY(defectDepth)}
              r="4.5"
              fill="#dc2626"
              fillOpacity="0.9"
            />
          </g>

          {/* Y-Axis (Depth mm) Ticks: 0, 1, 2, 3, 4, 5 */}
          {[0, 1, 2, 3, 4, 5].map((d) => {
            const y = scaleY(d);
            return (
              <g key={d}>
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
                  {d}
                </text>
              </g>
            );
          })}

          {/* X-Axis (Index Offset mm) Ticks: -14, -12, -10, -8, -6, -4, -2, 0, 2, 4, 6, 8, 10, 12 */}
          {[-14, -12, -10, -8, -6, -4, -2, 0, 2, 4, 6, 8, 10, 12].map((o) => {
            const x = scaleX(o);
            return (
              <g key={o}>
                <line
                  x1={x}
                  y1={margin.top + innerHeight}
                  x2={x}
                  y2={margin.top + innerHeight + 5}
                  stroke="#334155"
                  strokeWidth="1"
                />
                <text
                  x={x}
                  y={margin.top + innerHeight + 17}
                  textAnchor="middle"
                  fontSize="9.5"
                  fontFamily="sans-serif"
                  fill="#1e293b"
                  fontWeight="600"
                >
                  {o}
                </text>
              </g>
            );
          })}

          {/* Axis Labels */}
          <text
            x={margin.left + innerWidth / 2}
            y={height - 10}
            textAnchor="middle"
            fontSize="10.5"
            fontWeight="bold"
            fill="#0f172a"
          >
            Index Offset (mm)
          </text>

          <text
            x={-(margin.top + innerHeight / 2)}
            y={18}
            textAnchor="middle"
            transform="rotate(-90)"
            fontSize="10.5"
            fontWeight="bold"
            fill="#0f172a"
          >
            Depth (mm)
          </text>

          {/* Floating Crosshair Cursor */}
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
              {/* Hollow reticle with clear center so ultrasonic echo & bevel lines beneath are 100% visible */}
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

        {/* Docked Inspector HUD Card — Always stays in opposite corner away from cursor */}
        {hoverCursor && (
          <div
            className={`absolute pointer-events-none z-30 bg-white/95 backdrop-blur-md border border-slate-300 rounded-lg shadow-xl p-3 text-xs text-slate-800 transition-all duration-100 ${
              hoverCursor.xPx > width / 2 ? "left-3 top-3" : "right-3 top-3"
            }`}
            style={{
              minWidth: "220px",
            }}
          >
            <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-200">
              <span className="font-bold text-slate-900">Bevel Cross-Section</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-100 text-sky-800">
                {hoverCursor.percentOfWallThickness}% of Wall
              </span>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Through-Wall Depth:</span>
                <span className="font-mono font-bold text-sky-800">{hoverCursor.depthMm} mm</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Index Offset:</span>
                <span className="font-mono font-bold text-slate-900">
                  {hoverCursor.offsetMm > 0 ? `+${hoverCursor.offsetMm}` : hoverCursor.offsetMm} mm
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Distance to Centerline:</span>
                <span className="font-mono text-slate-700">{hoverCursor.distanceToCenterlineMm} mm</span>
              </div>
              <div className="pt-1 border-t border-slate-100 flex justify-between">
                <span className="text-slate-500">Remaining Sound Wall:</span>
                <span className="font-bold text-emerald-700 font-mono">{hoverCursor.remainingWallMm} mm</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Cross-section details */}
      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
        <span>Defect Echo Peak: <strong className="text-slate-800">{defectDepth.toFixed(1)} mm depth</strong> at <strong className="text-slate-800">{defectOffset > 0 ? `+${defectOffset}` : defectOffset} mm offset</strong></span>
        <span>Nominal Wall Thickness: <strong className="text-slate-800">{nominalWallThickness.toFixed(1)} mm</strong></span>
      </div>
    </div>
  );
}
