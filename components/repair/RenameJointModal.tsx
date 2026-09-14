"use client";

import { useState, useEffect } from "react";
import { 
  Pencil, 
  X, 
  Check, 
  RotateCcw, 
  Layers, 
  Info, 
  Sparkles 
} from "lucide-react";

interface RenameJointModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableWelds: string[];
  activeWeld?: string;
  jointAliases: Record<string, string>;
  onSaveAliases: (aliases: Record<string, string>) => void;
}

export function RenameJointModal({
  isOpen,
  onClose,
  availableWelds,
  activeWeld,
  jointAliases,
  onSaveAliases,
}: RenameJointModalProps) {
  const [localAliases, setLocalAliases] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<string>("ALL");

  useEffect(() => {
    if (isOpen) {
      setLocalAliases({ ...jointAliases });
      if (activeWeld && activeWeld !== "ALL" && availableWelds.includes(activeWeld)) {
        setActiveTab(activeWeld);
      } else {
        setActiveTab("ALL");
      }
    }
  }, [isOpen, jointAliases, activeWeld, availableWelds]);

  if (!isOpen) return null;

  const handleAliasChange = (weld: string, val: string) => {
    setLocalAliases((prev) => {
      const updated = { ...prev };
      if (!val.trim()) {
        delete updated[weld];
      } else {
        updated[weld] = val;
      }
      return updated;
    });
  };

  const handleResetWeld = (weld: string) => {
    setLocalAliases((prev) => {
      const updated = { ...prev };
      delete updated[weld];
      return updated;
    });
  };

  const handleSave = () => {
    onSaveAliases(localAliases);
    onClose();
  };

  const weldsToDisplay = activeTab === "ALL" 
    ? availableWelds 
    : availableWelds.filter((w) => w === activeTab);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-xl w-full overflow-hidden flex flex-col max-h-[85vh]">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-400">
              <Pencil size={18} />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">
                Customize Weld Joint Names
              </h3>
              <p className="text-xs text-slate-400">
                Update joint display labels (e.g. C1, C2, C9) to match client/refinery terminology
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Info Banner */}
        <div className="bg-indigo-50/70 border-b border-indigo-100 px-6 py-2.5 flex items-center gap-2 text-xs text-indigo-900">
          <Info size={15} className="text-indigo-600 shrink-0" />
          <span>
            The underlying joint code (e.g. <code>C9</code>) remains intact for historical multi-campaign data matching, while your custom title appears across all charts, tables, and reports.
          </span>
        </div>

        {/* Tab Scrubber */}
        {availableWelds.length > 1 && (
          <div className="flex items-center gap-1.5 px-6 py-2.5 border-b border-slate-100 bg-slate-50/80 overflow-x-auto text-xs">
            <button
              onClick={() => setActiveTab("ALL")}
              className={`px-3 py-1 rounded-md font-bold transition whitespace-nowrap ${
                activeTab === "ALL"
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
              }`}
            >
              All Joints ({availableWelds.length})
            </button>
            {availableWelds.map((w) => {
              const hasCustom = Boolean(localAliases[w]);
              return (
                <button
                  key={w}
                  onClick={() => setActiveTab(w)}
                  className={`px-2.5 py-1 rounded-md font-bold transition flex items-center gap-1 whitespace-nowrap ${
                    activeTab === w
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  <span>{w}</span>
                  {hasCustom && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Joint List Body */}
        <div className="p-6 overflow-y-auto space-y-4">
          {weldsToDisplay.map((w) => {
            const currentVal = localAliases[w] || "";
            return (
              <div
                key={w}
                className="bg-slate-50/80 border border-slate-200 rounded-xl p-3.5 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-extrabold text-xs px-2 py-0.5 rounded bg-indigo-100 text-indigo-900 border border-indigo-200">
                      {w}
                    </span>
                    <span className="text-xs font-semibold text-slate-700">
                      Original Joint Code
                    </span>
                  </div>
                  {currentVal && (
                    <button
                      type="button"
                      onClick={() => handleResetWeld(w)}
                      className="text-[11px] text-slate-500 hover:text-red-600 flex items-center gap-1 font-medium transition"
                      title="Reset to default joint name"
                    >
                      <RotateCcw size={12} />
                      <span>Reset</span>
                    </button>
                  )}
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                    Display Name / Custom Refinery Nomenclature:
                  </label>
                  <input
                    type="text"
                    value={currentVal}
                    placeholder={`e.g. Circumferential Seam ${w} (Bottom Cone / Skirt)`}
                    onChange={(e) => handleAliasChange(w, e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none placeholder:text-slate-400 placeholder:font-normal"
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-3.5 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-100 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-sm flex items-center gap-1.5 transition"
          >
            <Check size={15} />
            <span>Apply Joint Names</span>
          </button>
        </div>
      </div>
    </div>
  );
}
