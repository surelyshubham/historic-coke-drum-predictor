"use client";

import { useState } from "react";
import { RepairZone, DisappearedFlawAnomaly } from "@/types/repair";
import { 
  AlertTriangle, 
  CheckCircle2, 
  X, 
  Plus, 
  Trash2, 
  Wrench, 
  HelpCircle, 
  ShieldCheck, 
  Layers 
} from "lucide-react";

interface RepairAnomalyModalProps {
  isOpen: boolean;
  onClose: () => void;
  anomalies: DisappearedFlawAnomaly[];
  repairZones: RepairZone[];
  onAddRepairZone: (zone: RepairZone) => void;
  onRemoveRepairZone: (id: string) => void;
  onResolveAnomaly: (anomaly: DisappearedFlawAnomaly, wasRepaired: boolean, zone?: RepairZone) => void;
  currentWeldName?: string;
  currentDrumName?: string;
}

export function RepairAnomalyModal({
  isOpen,
  onClose,
  anomalies,
  repairZones,
  onAddRepairZone,
  onRemoveRepairZone,
  onResolveAnomaly,
  currentWeldName = "Weld Seam",
  currentDrumName = "Coke Drum",
}: RepairAnomalyModalProps) {
  const [activeTab, setActiveTab] = useState<"ANOMALIES" | "MANAGE">(
    anomalies.length > 0 ? "ANOMALIES" : "MANAGE"
  );
  const [selectedAnomalyIdx, setSelectedAnomalyIdx] = useState<number>(0);

  // Partial repair form state for the anomaly
  const [customStartMm, setCustomStartMm] = useState<number>(2000);
  const [customEndMm, setCustomEndMm] = useState<number>(5000);
  const [repairDescription, setRepairDescription] = useState<string>("Flush window patch / cutout replacement");
  const [isExpandingRepairForm, setIsExpandingRepairForm] = useState<boolean>(false);

  // Manual Add Form State
  const [manualStartMeters, setManualStartMeters] = useState<string>("2.0");
  const [manualEndMeters, setManualEndMeters] = useState<string>("5.0");
  const [manualWeldName, setManualWeldName] = useState<string>(currentWeldName);
  const [manualDesc, setManualDesc] = useState<string>("Full-thickness window cutout replacement");

  if (!isOpen) return null;

  const currentAnomaly = anomalies[selectedAnomalyIdx];

  const handleStartRepairAnomaly = () => {
    if (currentAnomaly) {
      setCustomStartMm(currentAnomaly.suggestedStartMm);
      setCustomEndMm(currentAnomaly.suggestedEndMm);
      setIsExpandingRepairForm(true);
    }
  };

  const handleConfirmRepair = () => {
    if (!currentAnomaly) return;
    const newZone: RepairZone = {
      id: `rz_${Date.now()}`,
      weldName: currentAnomaly.weldName || currentWeldName,
      drumName: currentAnomaly.drumName || currentDrumName,
      startMm: customStartMm,
      endMm: customEndMm,
      repairDate: new Date().toISOString().split("T")[0],
      campaignKey: currentAnomaly.missingInCampaign,
      description: repairDescription,
      restoredThicknessMm: 32.0,
    };
    onResolveAnomaly(currentAnomaly, true, newZone);
    setIsExpandingRepairForm(false);
    if (selectedAnomalyIdx >= anomalies.length - 1) {
      setSelectedAnomalyIdx(Math.max(0, anomalies.length - 2));
    }
  };

  const handleRejectRepair = () => {
    if (!currentAnomaly) return;
    onResolveAnomaly(currentAnomaly, false);
    setIsExpandingRepairForm(false);
    if (selectedAnomalyIdx >= anomalies.length - 1) {
      setSelectedAnomalyIdx(Math.max(0, anomalies.length - 2));
    }
  };

  const handleManualAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const startMm = Math.round(parseFloat(manualStartMeters) * 1000);
    const endMm = Math.round(parseFloat(manualEndMeters) * 1000);
    if (isNaN(startMm) || isNaN(endMm) || startMm >= endMm) {
      alert("Please enter valid start and end positions where start is less than end.");
      return;
    }
    const newZone: RepairZone = {
      id: `rz_${Date.now()}`,
      weldName: manualWeldName || currentWeldName,
      drumName: currentDrumName,
      startMm,
      endMm,
      repairDate: new Date().toISOString().split("T")[0],
      description: manualDesc,
      restoredThicknessMm: 32.0,
    };
    onAddRepairZone(newZone);
    setManualDesc("Full-thickness window cutout replacement");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400">
              <Wrench size={20} />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">
                Weld Replacement &amp; Repair Manager
              </h3>
              <p className="text-xs text-slate-400">
                Manage partial weld replacements, window cutouts, and scan anomaly reviews
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

        {/* Navigation Tabs */}
        <div className="flex items-center border-b border-slate-200 bg-slate-50 px-6 pt-2">
          <button
            onClick={() => setActiveTab("ANOMALIES")}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition ${
              activeTab === "ANOMALIES"
                ? "border-sky-600 text-sky-700 bg-white rounded-t-lg"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <AlertTriangle size={15} className={anomalies.length > 0 ? "text-amber-500" : "text-slate-400"} />
            <span>Disappearance Anomaly Prompt</span>
            {anomalies.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-900">
                {anomalies.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("MANAGE")}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition ${
              activeTab === "MANAGE"
                ? "border-sky-600 text-sky-700 bg-white rounded-t-lg"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Layers size={15} className="text-emerald-600" />
            <span>Active Replacement Zones</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-900">
              {repairZones.length}
            </span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {activeTab === "ANOMALIES" && (
            <div>
              {anomalies.length === 0 ? (
                <div className="text-center py-10 space-y-3">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                    <CheckCircle2 size={24} />
                  </div>
                  <h4 className="font-bold text-slate-900 text-sm">No Unresolved Anomalies</h4>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    All historical indications across inspection campaigns continue to track normally, or all missing indications have already been confirmed.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Current Anomaly Review Card */}
                  <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 text-xs space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-amber-950 text-sm">
                          {currentAnomaly.indicationCode}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-amber-200 text-amber-900 font-bold text-[10px]">
                          Anomaly {selectedAnomalyIdx + 1} of {anomalies.length}
                        </span>
                      </div>
                      <span className="font-mono text-slate-600 font-medium">
                        {currentAnomaly.weldName} @ {currentAnomaly.approximateLocationMm} mm
                      </span>
                    </div>

                    <p className="text-slate-700 leading-relaxed">
                      In the last scan (<strong>{currentAnomaly.lastObservedCampaign}</strong>), an indication with length{" "}
                      <strong>{currentAnomaly.detectedLengthMm} mm</strong> was detected at this position. On the latest scan update (
                      <strong>{currentAnomaly.missingInCampaign}</strong>), this indication is <strong>no longer detected</strong>.
                    </p>

                    <div className="bg-white p-3 rounded-lg border border-amber-300 font-medium text-slate-800">
                      <p className="text-xs font-bold text-amber-900 mb-1 flex items-center gap-1.5">
                        <HelpCircle size={14} className="text-amber-600" />
                        <span>Why is it not here? Was this weld section repaired or replaced?</span>
                      </p>
                      <p className="text-[11px] text-slate-600">
                        Select <strong>Yes</strong> if a cutout or flush patch was installed, or <strong>No</strong> if this is a missed detection by the NDT technician.
                      </p>
                    </div>

                    {!isExpandingRepairForm ? (
                      <div className="flex items-center gap-3 pt-2">
                        <button
                          type="button"
                          onClick={handleStartRepairAnomaly}
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-3 rounded-lg text-xs transition shadow-xs flex items-center justify-center gap-1.5"
                        >
                          <CheckCircle2 size={15} />
                          <span>Yes, It Was Repaired / Replaced</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleRejectRepair}
                          className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 px-3 rounded-lg text-xs transition border border-slate-300 flex items-center justify-center gap-1.5"
                        >
                          <X size={15} />
                          <span>No, Not Repaired (Discrepancy)</span>
                        </button>
                      </div>
                    ) : (
                      /* Expanded Partial Repair Boundaries Form */
                      <div className="bg-white p-4 rounded-xl border border-emerald-300 space-y-3 pt-3">
                        <h5 className="font-bold text-emerald-950 text-xs flex items-center gap-1.5">
                          <ShieldCheck size={15} className="text-emerald-600" />
                          <span>Specify Replaced / Repaired Section Bounds</span>
                        </h5>

                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div>
                            <label className="text-slate-600 font-semibold block mb-1">
                              Start Position (mm):
                            </label>
                            <input
                              type="number"
                              value={customStartMm}
                              onChange={(e) => setCustomStartMm(Number(e.target.value))}
                              className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-900 bg-slate-50"
                            />
                            <span className="text-[10px] text-slate-400">
                              {(customStartMm / 1000).toFixed(2)} meters
                            </span>
                          </div>
                          <div>
                            <label className="text-slate-600 font-semibold block mb-1">
                              End Position (mm):
                            </label>
                            <input
                              type="number"
                              value={customEndMm}
                              onChange={(e) => setCustomEndMm(Number(e.target.value))}
                              className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-900 bg-slate-50"
                            />
                            <span className="text-[10px] text-slate-400">
                              {(customEndMm / 1000).toFixed(2)} meters
                            </span>
                          </div>
                        </div>

                        <div>
                          <label className="text-slate-600 font-semibold block mb-1">
                            Repair Description:
                          </label>
                          <input
                            type="text"
                            value={repairDescription}
                            onChange={(e) => setRepairDescription(e.target.value)}
                            className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 bg-slate-50"
                          />
                        </div>

                        <div className="flex items-center gap-2 pt-2">
                          <button
                            type="button"
                            onClick={handleConfirmRepair}
                            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-3 rounded-lg text-xs transition shadow-xs"
                          >
                            Confirm Repair &amp; Apply Darker Shading
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsExpandingRepairForm(false)}
                            className="px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "MANAGE" && (
            <div className="space-y-5">
              {/* Manual Add Form */}
              <form
                onSubmit={handleManualAdd}
                className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3"
              >
                <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                  <Plus size={15} className="text-sky-600" />
                  <span>Define Replaced Weld Section / Window Cutout</span>
                </h4>

                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="text-slate-500 font-semibold block mb-1">
                      Weld Joint:
                    </label>
                    <input
                      type="text"
                      value={manualWeldName}
                      onChange={(e) => setManualWeldName(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-900 bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-slate-500 font-semibold block mb-1">
                      Start (Meters):
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={manualStartMeters}
                      onChange={(e) => setManualStartMeters(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-900 bg-white"
                      placeholder="e.g. 2.0"
                    />
                  </div>
                  <div>
                    <label className="text-slate-500 font-semibold block mb-1">
                      End (Meters):
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={manualEndMeters}
                      onChange={(e) => setManualEndMeters(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-900 bg-white"
                      placeholder="e.g. 5.0"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-slate-500 font-semibold block mb-1">
                    Notes / Work Order Description:
                  </label>
                  <input
                    type="text"
                    value={manualDesc}
                    onChange={(e) => setManualDesc(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 bg-white"
                  />
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    className="bg-sky-600 hover:bg-sky-700 text-white font-bold py-1.5 px-4 rounded-lg text-xs transition shadow-xs flex items-center gap-1.5"
                  >
                    <Plus size={14} />
                    <span>Add Replaced Section</span>
                  </button>
                </div>
              </form>

              {/* Active Zones List */}
              <div className="space-y-2">
                <h4 className="font-bold text-slate-900 text-xs">
                  Active Replaced Sections ({repairZones.length})
                </h4>

                {repairZones.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-3 text-center border border-dashed border-slate-200 rounded-lg">
                    No replaced sections currently defined. The full circumference is rendered with original baseline metal.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {repairZones.map((rz) => (
                      <div
                        key={rz.id}
                        className="flex items-center justify-between p-3 rounded-lg border border-emerald-200 bg-emerald-50/50 text-xs"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-emerald-950">
                              Joint {rz.weldName}: {(rz.startMm / 1000).toFixed(2)}m – {(rz.endMm / 1000).toFixed(2)}m
                            </span>
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-200 text-emerald-900">
                              {((rz.endMm - rz.startMm) / 1000).toFixed(2)}m span
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600">
                            {rz.description || "Window cutout replacement"}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onRemoveRepairZone(rz.id)}
                          className="p-1.5 rounded-md text-red-600 hover:bg-red-100 transition"
                          title="Remove replaced section"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-3 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold transition"
          >
            Close &amp; Return to Visualizer
          </button>
        </div>
      </div>
    </div>
  );
}
