"use client";

import { useState, useEffect } from "react";
import { Palette, Check, RotateCcw, ShieldCheck, Building2, Cylinder, AlertCircle } from "lucide-react";
import {
  ColorScaleConfig,
  DEFAULT_COLOR_SCALE,
  getStoredColorScale,
  saveAdminGlobalColorScale,
  saveClientColorScale,
  saveDrumColorScale,
  resetAdminGlobalColorScale,
  resetClientColorScale,
  resetDrumColorScale,
} from "@/lib/colors/colorScales";

export function ColorScaleAdminManager() {
  const [scope, setScope] = useState<"GLOBAL" | "CLIENT" | "DRUM">("GLOBAL");
  const [targetId, setTargetId] = useState<string>("1");
  const [config, setConfig] = useState<ColorScaleConfig>(DEFAULT_COLOR_SCALE);
  const [savedSuccess, setSavedSuccess] = useState<string | null>(null);

  // Load current configuration whenever scope or targetId changes
  useEffect(() => {
    if (scope === "GLOBAL") {
      setConfig(getStoredColorScale());
    } else if (scope === "CLIENT") {
      const cid = parseInt(targetId) || 1;
      setConfig(getStoredColorScale(cid, null));
    } else if (scope === "DRUM") {
      const did = parseInt(targetId) || 1;
      setConfig(getStoredColorScale(null, did));
    }
  }, [scope, targetId]);

  const handleSoundWallChange = (color: string) => {
    setConfig((prev) => ({
      ...prev,
      soundWallColor: color,
    }));
  };

  const handleTierColorChange = (tierId: string, color: string) => {
    setConfig((prev) => ({
      ...prev,
      tiers: prev.tiers.map((t) => (t.id === tierId ? { ...t, color } : t)),
    }));
  };

  const handleTierLabelChange = (tierId: string, label: string) => {
    setConfig((prev) => ({
      ...prev,
      tiers: prev.tiers.map((t) => (t.id === tierId ? { ...t, label } : t)),
    }));
  };

  const handleSave = () => {
    if (scope === "GLOBAL") {
      saveAdminGlobalColorScale(config);
      setSavedSuccess("Global color scale updated! Overrides default colors platform-wide.");
    } else if (scope === "CLIENT") {
      const cid = parseInt(targetId) || 1;
      saveClientColorScale(cid, config);
      setSavedSuccess(`Custom color scale saved for Client #${cid}!`);
    } else if (scope === "DRUM") {
      const did = parseInt(targetId) || 1;
      saveDrumColorScale(did, config);
      setSavedSuccess(`Custom color scale saved for Coke Drum #${did}!`);
    }

    setTimeout(() => setSavedSuccess(null), 4000);
  };

  const handleReset = () => {
    if (scope === "GLOBAL") {
      resetAdminGlobalColorScale();
      setConfig(DEFAULT_COLOR_SCALE);
      setSavedSuccess("Reset to standard PAUT reference color palette.");
    } else if (scope === "CLIENT") {
      const cid = parseInt(targetId) || 1;
      resetClientColorScale(cid);
      setConfig(getStoredColorScale());
      setSavedSuccess(`Reset color scale for Client #${cid} to system defaults.`);
    } else if (scope === "DRUM") {
      const did = parseInt(targetId) || 1;
      resetDrumColorScale(did);
      setConfig(getStoredColorScale());
      setSavedSuccess(`Reset color scale for Drum #${did} to system defaults.`);
    }

    setTimeout(() => setSavedSuccess(null), 4000);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center shrink-0">
            <Palette size={20} />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">PAUT Defect Severity & Ring Map Color Scale</h3>
            <p className="text-xs text-slate-500">
              Configure depth severity color codes for circumferential ring maps, defect logs, and client reports
            </p>
          </div>
        </div>

        {/* Scope Selector: Global vs Client vs Drum */}
        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg text-xs font-semibold">
          <button
            type="button"
            onClick={() => setScope("GLOBAL")}
            className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition ${
              scope === "GLOBAL"
                ? "bg-white text-slate-900 shadow-xs font-bold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <ShieldCheck size={14} className="text-violet-600" />
            <span>Global Admin</span>
          </button>
          <button
            type="button"
            onClick={() => setScope("CLIENT")}
            className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition ${
              scope === "CLIENT"
                ? "bg-white text-slate-900 shadow-xs font-bold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Building2 size={14} className="text-sky-600" />
            <span>Per Client</span>
          </button>
          <button
            type="button"
            onClick={() => setScope("DRUM")}
            className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition ${
              scope === "DRUM"
                ? "bg-white text-slate-900 shadow-xs font-bold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Cylinder size={14} className="text-amber-600" />
            <span>Per Drum</span>
          </button>
        </div>
      </div>

      {/* Scope Target Specification (when Per-Client or Per-Drum is selected) */}
      {scope !== "GLOBAL" && (
        <div className="flex items-center gap-3 p-3 bg-sky-50 border border-sky-200 rounded-lg text-xs">
          <AlertCircle size={16} className="text-sky-700 shrink-0" />
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sky-900">
              {scope === "CLIENT" ? "Target Client Facility ID:" : "Target Coke Drum ID:"}
            </span>
            <input
              type="number"
              min="1"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="w-20 px-2 py-1 bg-white border border-sky-300 rounded font-mono font-bold text-slate-900 text-xs"
            />
            <span className="text-sky-700">
              {scope === "CLIENT"
                ? "Overrides will apply exclusively to all drums under this Client."
                : "Overrides will apply exclusively to inspections of this specific Coke Drum."}
            </span>
          </div>
        </div>
      )}

      {/* Live Color Scale Preview Strip */}
      <div className="space-y-2">
        <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
          Active Visual Palette Preview:
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 p-3 bg-slate-50 border border-slate-200 rounded-xl">
          {/* Sound wall */}
          <div className="p-2.5 rounded-lg border border-slate-200 bg-white flex flex-col gap-1.5 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-700">Sound Wall</span>
              <span
                className="w-4 h-4 rounded-md border border-slate-400/40 shrink-0"
                style={{ backgroundColor: config.soundWallColor }}
              />
            </div>
            <span className="text-[10px] text-slate-500">No crack detected</span>
            <span className="font-mono text-[10px] text-slate-400">{config.soundWallColor}</span>
          </div>

          {/* 4 Crack Tiers */}
          {config.tiers.map((tier) => (
            <div
              key={tier.id}
              className="p-2.5 rounded-lg border border-slate-200 bg-white flex flex-col gap-1.5 shadow-2xs"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-800">{tier.label}</span>
                <span
                  className="w-4 h-4 rounded-md border border-slate-400/40 shrink-0"
                  style={{ backgroundColor: tier.color }}
                />
              </div>
              <span className="text-[10px] text-slate-500">
                {tier.maxDepthMm ? `${tier.minDepthMm}mm – ${tier.maxDepthMm}mm` : `> ${tier.minDepthMm}mm`}
              </span>
              <span className="font-mono text-[10px] text-slate-400">{tier.color}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Interactive Color Editors */}
      <div className="space-y-4">
        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
          Customize Colors &amp; Depth Bands:
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Sound Wall Tier */}
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900">Sound Base Metal Wall</span>
              <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                0 mm
              </span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={config.soundWallColor}
                onChange={(e) => handleSoundWallChange(e.target.value)}
                className="w-10 h-10 rounded-lg cursor-pointer border border-slate-300 p-0.5 bg-white"
              />
              <input
                type="text"
                value={config.soundWallColor}
                onChange={(e) => handleSoundWallChange(e.target.value)}
                className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-mono font-bold text-slate-800"
              />
            </div>
          </div>

          {/* Defect Tiers */}
          {config.tiers.map((tier) => (
            <div key={tier.id} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
              <div className="flex items-center justify-between">
                <input
                  type="text"
                  value={tier.label}
                  onChange={(e) => handleTierLabelChange(tier.id, e.target.value)}
                  className="text-xs font-bold text-slate-900 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-sky-500 focus:outline-none"
                />
                <span className="text-[10px] font-mono text-slate-500">
                  {tier.maxDepthMm ? `${tier.minDepthMm}–${tier.maxDepthMm}mm` : `>${tier.minDepthMm}mm`}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={tier.color}
                  onChange={(e) => handleTierColorChange(tier.id, e.target.value)}
                  className="w-10 h-10 rounded-lg cursor-pointer border border-slate-300 p-0.5 bg-white"
                />
                <input
                  type="text"
                  value={tier.color}
                  onChange={(e) => handleTierColorChange(tier.id, e.target.value)}
                  className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-mono font-bold text-slate-800"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Status Alert */}
      {savedSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 font-semibold flex items-center gap-2">
          <Check size={16} className="text-emerald-600 shrink-0" />
          <span>{savedSuccess}</span>
        </div>
      )}

      {/* Footer Controls */}
      <div className="flex items-center justify-between pt-3 border-t border-slate-200">
        <button
          type="button"
          onClick={handleReset}
          className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-100 flex items-center gap-2 transition"
        >
          <RotateCcw size={14} />
          <span>Reset to Factory Defaults</span>
        </button>

        <button
          type="button"
          onClick={handleSave}
          className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold shadow-xs flex items-center gap-2 transition"
        >
          <Check size={14} />
          <span>Save &amp; Apply Colors</span>
        </button>
      </div>
    </div>
  );
}
