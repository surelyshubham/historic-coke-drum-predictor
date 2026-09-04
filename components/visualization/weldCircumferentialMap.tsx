"use client";

import { useState } from "react";
import { TrackedPhysicalIndication, MatrixCampaignDef } from "@/lib/import/matrixParser";
import { ZoomIn, ZoomOut, RotateCcw, AlertTriangle, Layers, Info, CheckCircle2 } from "lucide-react";

interface WeldMapProps {
  indications: TrackedPhysicalIndication[];
  selectedCampaign?: string;
  campaigns: MatrixCampaignDef[];
  activeWeldName: string;
  activeDrumName: string;
  totalCircumferenceMm?: number;
  onSelectIndication?: (pi: TrackedPhysicalIndication) => void;
  selectedIndicationCode?: string;
}

export function WeldCircumferentialMap({
  indications,
  selectedCampaign,
  campaigns,
  activeWeldName,
  activeDrumName,
  totalCircumferenceMm = 28180, // standard ~28.2m circumference
  onSelectIndication,
  selectedIndicationCode,
}: WeldMapProps) {
  const [selectedPi, setSelectedPi] = useState<TrackedPhysicalIndication | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<number>(0);

  // Filter indications for current selected campaign or show latest
  const renderedIndications = indications.map(pi => {
    let displayLength = pi.latestLength;
    let isPresentInCampaign = true;

    if (selectedCampaign && selectedCampaign !== "ALL") {
      const campVal = pi.campaignValues[selectedCampaign];
      if (campVal && campVal.length !== null && campVal.length > 0) {
        displayLength = campVal.length;
      } else {
        isPresentInCampaign = false;
      }
    }

    return {
      ...pi,
      displayLength,
      isPresentInCampaign,
    };
  }).filter(i => i.isPresentInCampaign);

  const segments = [
    { label: "0-3m", start: 0, end: 3000 },
    { label: "3-6m", start: 3000, end: 6000 },
    { label: "6-9m", start: 6000, end: 9000 },
    { label: "9-12m", start: 9000, end: 12000 },
    { label: "12-15m", start: 12000, end: 15000 },
    { label: "15-18m", start: 15000, end: 18000 },
    { label: "18-21m", start: 18000, end: 21000 },
    { label: "21-24m", start: 21000, end: 24000 },
    { label: "24-28m", start: 24000, end: totalCircumferenceMm },
  ];

  const getFlawColor = (pi: TrackedPhysicalIndication) => {
    if (pi.hasRepairs) return "bg-emerald-500 border-emerald-700 text-white";
    if (pi.growthDelta > 300 || pi.latestLength > 1500) return "bg-red-500 border-red-700 text-white";
    if (pi.growthDelta > 0) return "bg-amber-500 border-amber-700 text-white";
    return "bg-sky-500 border-sky-700 text-white";
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-6">
      {/* Visualizer Top Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold px-2 py-0.5 bg-sky-100 text-sky-800 rounded">
              Tank: {activeDrumName}
            </span>
            <span className="text-xs font-bold px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded">
              Weld Joint: {activeWeldName}
            </span>
            <h3 className="text-base font-bold text-slate-800 ml-2">2D Circumferential Weld Map (0 – 28.2 m)</h3>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Displaying {renderedIndications.length} physical indications along the circumference. Click any indication to inspect growth history.
          </p>
        </div>

        {/* Zoom & Reset Controls */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setZoomLevel(prev => Math.max(1, prev - 0.5))}
            className="p-1.5 rounded border border-slate-300 text-slate-600 hover:bg-slate-50 text-xs flex items-center"
            title="Zoom Out"
          >
            <ZoomOut size={14} />
          </button>
          <span className="text-xs font-semibold text-slate-500 px-1">{zoomLevel.toFixed(1)}x</span>
          <button
            onClick={() => setZoomLevel(prev => Math.min(3, prev + 0.5))}
            className="p-1.5 rounded border border-slate-300 text-slate-600 hover:bg-slate-50 text-xs flex items-center"
            title="Zoom In"
          >
            <ZoomIn size={14} />
          </button>
          <button
            onClick={() => { setZoomLevel(1); setPanOffset(0); }}
            className="p-1.5 rounded border border-slate-300 text-slate-600 hover:bg-slate-50 text-xs flex items-center ml-2"
            title="Reset View"
          >
            <RotateCcw size={14} />
          </button>
        </div>
      </div>

      {/* 2D Circumferential Strip Canvas */}
      <div className="space-y-2 overflow-x-auto pb-4">
        {/* Metric Segment Ticks */}
        <div 
          className="relative h-6 text-[11px] font-semibold text-slate-500 flex border-b border-slate-300"
          style={{ width: `${zoomLevel * 100}%`, minWidth: "800px" }}
        >
          {segments.map((seg, idx) => {
            const leftPct = (seg.start / totalCircumferenceMm) * 100;
            return (
              <div 
                key={seg.label} 
                className="absolute top-0 bottom-0 border-l border-slate-300 pl-1 flex items-center"
                style={{ left: `${leftPct}%` }}
              >
                <span>{seg.label}</span>
              </div>
            );
          })}
          <div className="absolute right-0 top-0 bottom-0 border-r border-slate-300 pr-1 flex items-center">
            <span>28.2m</span>
          </div>
        </div>

        {/* Weld Joint Strip (Steel Plate visualization) */}
        <div 
          className="relative h-28 bg-gradient-to-b from-slate-100 via-slate-200 to-slate-100 rounded-lg border-2 border-slate-300 overflow-hidden shadow-inner flex items-center"
          style={{ width: `${zoomLevel * 100}%`, minWidth: "800px" }}
        >
          {/* Weld Centerline Bead */}
          <div className="absolute inset-x-0 h-3 bg-amber-200/70 border-y border-amber-300/80 pointer-events-none" />

          {/* Segment Grid Lines */}
          {segments.map(seg => (
            <div 
              key={seg.label}
              className="absolute inset-y-0 border-r border-slate-300/60 pointer-events-none"
              style={{ left: `${(seg.end / totalCircumferenceMm) * 100}%` }}
            />
          ))}

          {/* Indication Markers */}
          {renderedIndications.map((pi) => {
            const leftPct = (pi.circumferentialPosition / totalCircumferenceMm) * 100;
            // Width proportional to length, with a minimum clickable width of 1.2%
            const widthPct = Math.max(1.2, (pi.displayLength / totalCircumferenceMm) * 100);
            const isSelected = (selectedIndicationCode ? selectedIndicationCode === pi.code : selectedPi?.code === pi.code);

            return (
              <div
                key={pi.code}
                onClick={() => {
                  setSelectedPi(pi);
                  onSelectIndication?.(pi);
                }}
                className={`group absolute h-12 rounded-md cursor-pointer transition-all border flex flex-col justify-center px-1 shadow-xs hover:scale-105 hover:z-20 ${getFlawColor(pi)} ${isSelected ? "ring-4 ring-sky-400 z-30 scale-105" : ""}`}
                style={{
                  left: `${leftPct}%`,
                  width: `${widthPct}%`,
                  minWidth: "24px",
                }}
                title={`${pi.code} | Location: ${pi.locationText} | Length: ${pi.displayLength}mm | Depth: ${pi.latestDepth}mm`}
              >
                <div className="truncate text-[9px] font-bold text-center leading-tight">
                  {pi.displayLength}mm
                </div>
                <div className="truncate text-[8px] opacity-90 text-center">
                  {pi.code.split('-').pop()}
                </div>

                {/* Floating Hover Card */}
                <div className="hidden group-hover:block absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[11px] p-3 rounded-lg shadow-xl z-50 whitespace-nowrap min-w-[200px] pointer-events-none">
                  <p className="font-bold text-sky-300">{pi.code}</p>
                  <p className="text-slate-300">Weld: <strong>{pi.weldName}</strong> | Segment: <strong>{pi.segment}</strong></p>
                  <p className="text-slate-300">Location: <strong>{pi.locationText}</strong></p>
                  <div className="mt-1 pt-1 border-t border-slate-700 flex justify-between">
                    <span>Length: <strong>{pi.displayLength} mm</strong></span>
                    <span>Depth: <strong>{pi.latestDepth} mm</strong></span>
                  </div>
                  {pi.growthDelta > 0 && (
                    <p className="text-amber-400 font-semibold mt-0.5">
                      Growth: +{pi.growthDelta} mm (+{pi.growthRateYear} mm/yr)
                    </p>
                  )}
                  {pi.hasRepairs && (
                    <p className="text-emerald-400 font-semibold mt-0.5">
                      ✓ Post-Repair Inspected
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center justify-between pt-3 text-xs text-slate-600 gap-2">
          <div className="flex items-center space-x-4">
            <span className="font-semibold text-slate-700">Flaw Severity Legend:</span>
            <div className="flex items-center space-x-1.5">
              <span className="w-3 h-3 rounded bg-sky-500 inline-block" />
              <span>Stable Flaw</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-3 h-3 rounded bg-amber-500 inline-block" />
              <span>Growing Defect</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-3 h-3 rounded bg-red-500 inline-block" />
              <span>Severe Flaw (&gt;1.5m / Rapid Growth)</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-3 h-3 rounded bg-emerald-500 inline-block" />
              <span>Post-Repair (Repaired)</span>
            </div>
          </div>
          <span className="text-slate-400 italic">Reference '0' Point starting at 0 mm</span>
        </div>
      </div>

      {/* Selected Flaw Timeline Card */}
      {selectedPi && (
        <div className="bg-sky-50/70 rounded-xl border border-sky-200 p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-sky-200 pb-3">
            <div className="flex items-center space-x-3">
              <h4 className="text-base font-bold text-sky-950">
                Tracked Flaw Details: <span className="text-sky-700">{selectedPi.code}</span>
              </h4>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${selectedPi.hasRepairs ? "bg-emerald-100 text-emerald-800" : "bg-sky-100 text-sky-800"}`}>
                {selectedPi.hasRepairs ? "Repaired" : "Active Flaw"}
              </span>
            </div>
            <button 
              onClick={() => setSelectedPi(null)} 
              className="text-slate-400 hover:text-slate-600 text-xs font-bold"
            >
              ✕ Close
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div className="bg-white p-3 rounded-lg border border-sky-100">
              <p className="text-slate-500 font-medium">Tank & Weld Joint</p>
              <p className="text-sm font-bold text-slate-800 mt-0.5">{selectedPi.drumName} — Joint {selectedPi.weldName}</p>
            </div>
            <div className="bg-white p-3 rounded-lg border border-sky-100">
              <p className="text-slate-500 font-medium">Defect Location Range</p>
              <p className="text-sm font-bold text-slate-800 mt-0.5">{selectedPi.locationText}</p>
            </div>
            <div className="bg-white p-3 rounded-lg border border-sky-100">
              <p className="text-slate-500 font-medium">Latest Measurement</p>
              <p className="text-sm font-bold text-slate-800 mt-0.5">{selectedPi.latestLength} mm (Depth: {selectedPi.latestDepth} mm)</p>
            </div>
            <div className="bg-white p-3 rounded-lg border border-sky-100">
              <p className="text-slate-500 font-medium">Annual Growth Rate</p>
              <p className={`text-sm font-bold mt-0.5 ${selectedPi.growthDelta > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                {selectedPi.growthDelta > 0 ? `+${selectedPi.growthDelta} mm (+${selectedPi.growthRateYear} mm/yr)` : "Stable (0 mm/yr)"}
              </p>
            </div>
          </div>

          {/* Historical Campaign Progression Badges */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-sky-900">Campaign-by-Campaign Progression:</p>
            <div className="flex flex-wrap gap-2">
              {campaigns.map(c => {
                const val = selectedPi.campaignValues[c.key];
                if (!val || val.length === null) return null;
                return (
                  <div key={c.key} className="bg-white border border-sky-200 rounded-lg p-2.5 text-xs shadow-2xs">
                    <p className="font-bold text-slate-700">{c.label}</p>
                    <p className="text-sky-700 font-bold mt-0.5">Length: {val.length} mm</p>
                    {val.depth && <p className="text-slate-500 text-[10px]">Depth: {val.depth} mm</p>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
