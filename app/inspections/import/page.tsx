"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { 
  getDrumsAndWelds, 
  parseWorkbookFile, 
  commitMatrixDatasetAction,
  commitImportDatasetAction
} from "./actions";
import { MatrixParseResult, TrackedPhysicalIndication } from "@/lib/import/matrixParser";
import { WeldCircumferentialMap } from "@/components/visualization/weldCircumferentialMap";
import { 
  Upload, 
  CheckCircle2, 
  AlertTriangle, 
  FileSpreadsheet, 
  ArrowRight, 
  ArrowLeft, 
  Filter, 
  FileText, 
  Sparkles,
  Database,
  Sliders,
  TrendingUp,
  Download
} from "lucide-react";
import * as XLSX from "xlsx";

export default function ImportWizardPage() {
  const router = useRouter();
  const [step, setStep] = useState<"UPLOAD" | "PREFERENCES" | "VISUALIZATION" | "SAVED">("UPLOAD");
  const [drums, setDrums] = useState<any[]>([]);
  const [selectedDrumId, setSelectedDrumId] = useState<number>(1);

  // File Upload State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedWorkbook, setParsedWorkbook] = useState<any>(null);
  const [selectedSheet, setSelectedSheet] = useState("");

  // Multi-Campaign Matrix State
  const [matrixResult, setMatrixResult] = useState<MatrixParseResult | null>(null);

  // Tank & Weld Selection Preferences
  const [selectedTanks, setSelectedTanks] = useState<string[]>([]); // ["ALL"] or ["R01", "R02", ...]
  const [selectedWelds, setSelectedWelds] = useState<string[]>([]); // ["ALL"] or ["C6", ...]
  const [selectedCampaign, setSelectedCampaign] = useState<string>("ALL"); // "ALL" or specific campaign key

  // Loading & Action states
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [savedResult, setSavedResult] = useState<any>(null);

  useEffect(() => {
    getDrumsAndWelds().then((data) => {
      setDrums(data.drums);
      if (data.drums.length > 0) setSelectedDrumId(data.drums[0].id);
    }).catch(err => setErrorMessage(err.message));
  }, []);

  // Generate synthetic sample matching user's exact SEZ PAUT multi-campaign spreadsheet
  const generateSezMatrixDemoExcel = () => {
    const matrixRows = [
      // R01 Drum Flaws
      {
        "COKE DRUM NO": "R01",
        "JOINT NO": "C6",
        "SEGMENT [M]": "6-9",
        "DEFECT LOCATION FROM '0' POINT [MM] MAY-25": "7400-8400",
        "OCT-23 LENGTH [MM]": "600",
        "APRIL-24 LENGTH [MM]": "650",
        "SEP-24 LENGTH [MM]": "950",
        "MAY-25 LENGTH [MM]": "1000",
        "FEB-2026 LENGTH [MM]": "1000",
        "MAY-2026 LENGTH [MM]": "1000",
        "SEP-OCT'-25 DEPTH FROM OD [MM]": "2",
        "FEB-26 DEPTH FROM OD [MM]": "2",
        "DEFECT POSITION ON WELD [TOP TOE & BOTTOM TOE]": "30MM BT",
        "INDICATION TYPE": "Crack-like"
      },
      {
        "COKE DRUM NO": "R01",
        "JOINT NO": "C6",
        "SEGMENT [M]": "9-12",
        "DEFECT LOCATION FROM '0' POINT [MM] MAY-25": "9860-10000",
        "OCT-23 LENGTH [MM]": "NIL",
        "APRIL-24 LENGTH [MM]": "100",
        "SEP-24 LENGTH [MM]": "130",
        "MAY-25 LENGTH [MM]": "140",
        "FEB-2026 LENGTH [MM]": "140",
        "MAY-2026 LENGTH [MM]": "140",
        "SEP-OCT'-25 DEPTH FROM OD [MM]": "2",
        "FEB-26 DEPTH FROM OD [MM]": "2",
        "DEFECT POSITION ON WELD [TOP TOE & BOTTOM TOE]": "30MM BT",
        "INDICATION TYPE": "Crack-like"
      },
      {
        "COKE DRUM NO": "R01",
        "JOINT NO": "C6",
        "SEGMENT [M]": "9-12",
        "DEFECT LOCATION FROM '0' POINT [MM] MAY-25": "10335-10430",
        "OCT-23 LENGTH [MM]": "NIL",
        "APRIL-24 LENGTH [MM]": "70",
        "SEP-24 LENGTH [MM]": "80",
        "MAY-25 LENGTH [MM]": "95",
        "FEB-2026 LENGTH [MM]": "95",
        "MAY-2026 LENGTH [MM]": "95",
        "DEFECT POSITION ON WELD [TOP TOE & BOTTOM TOE]": "30MM BT",
        "INDICATION TYPE": "Crack-like"
      },
      // R02 Drum Flaws
      {
        "COKE DRUM NO": "R02",
        "JOINT NO": "C6",
        "SEGMENT [M]": "6-9",
        "DEFECT LOCATION FROM '0' POINT [MM] MAY-25": "7300-7470",
        "OCT-23 LENGTH [MM]": "170",
        "APRIL-24 LENGTH [MM]": "170",
        "SEP-24 LENGTH [MM]": "170",
        "MAY-25 LENGTH [MM]": "170",
        "FEB-2026 LENGTH [MM]": "NOT DONE",
        "MAY-2026 LENGTH [MM]": "170",
        "DEFECT POSITION ON WELD [TOP TOE & BOTTOM TOE]": "35MM BT",
        "INDICATION TYPE": "Crack-like"
      },
      {
        "COKE DRUM NO": "R02",
        "JOINT NO": "C6",
        "SEGMENT [M]": "12-15",
        "DEFECT LOCATION FROM '0' POINT [MM] MAY-25": "12000-15000",
        "OCT-23 LENGTH [MM]": "3000",
        "APRIL-24 LENGTH [MM]": "3000",
        "SEP-24 LENGTH [MM]": "3000",
        "MAY-25 LENGTH [MM]": "3000",
        "FEB-2026 LENGTH [MM]": "NOT DONE",
        "MAY-2026 LENGTH [MM]": "3000",
        "DEFECT POSITION ON WELD [TOP TOE & BOTTOM TOE]": "35MM BT",
        "INDICATION TYPE": "Crack-like"
      },
      // R05 Drum Flaws (with repair)
      {
        "COKE DRUM NO": "R05",
        "JOINT NO": "C6",
        "SEGMENT [M]": "9-12",
        "DEFECT LOCATION FROM '0' POINT [MM] AUGUST-2026 AFTER REPAIR": "10780-10793",
        "OCT-23 LENGTH [MM]": "NIL",
        "APRIL-24 LENGTH [MM]": "170",
        "SEP-24 LENGTH [MM]": "170",
        "MAY-25 LENGTH [MM]": "190",
        "AUGUST-2026 LENGTH [MM] AFTER REPAIR": "13",
        "AUGUST-26 DEPTH FROM OD [MM]": "22-28",
        "DEFECT POSITION ON WELD [TOP TOE & BOTTOM TOE]": "34 MM BT",
        "INDICATION TYPE": "LF"
      }
    ];

    const ws = XLSX.utils.json_to_sheet(matrixRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "SEZ_PAUT_Matrix_Summary");
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const file = new File([blob], "SEZ_COKE_DRUM_PAUT_OBSERVATION_SUMMARY.xlsx", { type: blob.type });
    setSelectedFile(file);
  };

  // Step 1: Upload & Process Workbook
  const handleFileUpload = async () => {
    if (!selectedFile) {
      setErrorMessage("Please select an inspection Excel or CSV file.");
      return;
    }
    setLoading(true);
    setErrorMessage("");
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      const res = await parseWorkbookFile(formData);
      setParsedWorkbook(res);

      if (res.sheetNames.length > 0) {
        const firstSheet = res.sheetNames[0];
        setSelectedSheet(firstSheet);
        const sheetInfo = res.sheetsData[firstSheet];

        if (sheetInfo.isMatrixFormat && sheetInfo.matrixResult) {
          setMatrixResult(sheetInfo.matrixResult);
          // Default selection to "ALL" tanks and "ALL" welds
          setSelectedTanks(["ALL"]);
          setSelectedWelds(["ALL"]);
          setStep("PREFERENCES");
        } else {
          // If not matrix, default to matrix representation with raw rows
          setErrorMessage("Standard single-campaign sheet detected. For best results, use the multi-campaign matrix format.");
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to process file");
    } finally {
      setLoading(false);
    }
  };

  // Toggle Tank selection
  const handleToggleTank = (tank: string) => {
    if (tank === "ALL") {
      setSelectedTanks(["ALL"]);
      return;
    }
    let updated = selectedTanks.filter(t => t !== "ALL");
    if (updated.includes(tank)) {
      updated = updated.filter(t => t !== tank);
      if (updated.length === 0) updated = ["ALL"];
    } else {
      updated.push(tank);
    }
    setSelectedTanks(updated);
  };

  // Toggle Weld selection
  const handleToggleWeld = (weld: string) => {
    if (weld === "ALL") {
      setSelectedWelds(["ALL"]);
      return;
    }
    let updated = selectedWelds.filter(w => w !== "ALL");
    if (updated.includes(weld)) {
      updated = updated.filter(w => w !== weld);
      if (updated.length === 0) updated = ["ALL"];
    } else {
      updated.push(weld);
    }
    setSelectedWelds(updated);
  };

  // Filter physical indications by selected Tanks and Welds
  const filteredIndications = (matrixResult?.physicalIndications || []).filter(pi => {
    const tankMatch = selectedTanks.includes("ALL") || selectedTanks.includes(pi.drumName);
    const weldMatch = selectedWelds.includes("ALL") || selectedWelds.includes(pi.weldName);
    return tankMatch && weldMatch;
  });

  // Available welds for selected tanks
  const availableWeldsForSelectedTanks = matrixResult ? Array.from(new Set(
    matrixResult.physicalIndications
      .filter(pi => selectedTanks.includes("ALL") || selectedTanks.includes(pi.drumName))
      .map(pi => pi.weldName)
  )).sort() : [];

  // Save to Database
  const handleSaveToDatabase = async () => {
    if (!matrixResult) return;
    setLoading(true);
    setErrorMessage("");
    try {
      const res = await commitMatrixDatasetAction({
        drumId: selectedDrumId,
        filename: parsedWorkbook.filename,
        sizeBytes: parsedWorkbook.sizeBytes,
        mimeType: parsedWorkbook.mimeType,
        matrixResult,
      });
      setSavedResult(res);
      setStep("SAVED");
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to save dataset");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Coke Drum PAUT Historical Inspection Platform</h2>
          <p className="text-sm text-slate-500">Upload Excel, select Tank(s) & Weld(s), and explore interactive 2D circumferential defect visualization</p>
        </div>

        {step !== "UPLOAD" && (
          <button
            onClick={() => { setStep("UPLOAD"); setSelectedFile(null); setMatrixResult(null); }}
            className="text-xs font-semibold px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 flex items-center space-x-1"
          >
            <Upload size={14} />
            <span>Upload Another File</span>
          </button>
        )}
      </div>

      {errorMessage && (
        <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-700 flex items-center space-x-3 text-sm">
          <AlertTriangle className="shrink-0" size={18} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* STEP 1: UPLOAD EXCEL FILE */}
      {step === "UPLOAD" && (
        <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-lg font-bold text-slate-800">Upload Inspection Spreadsheet</h3>
              <p className="text-xs text-slate-500">Supports multi-campaign historical summary workbooks (SEZ PAUT Observation Summary)</p>
            </div>
            <button
              onClick={generateSezMatrixDemoExcel}
              className="text-xs font-semibold text-sky-700 bg-sky-50 border border-sky-200 px-3.5 py-2 rounded-lg flex items-center space-x-2 hover:bg-sky-100 transition-colors"
            >
              <Sparkles size={15} className="text-sky-600" />
              <span>Load Synthetic SEZ PAUT Matrix File</span>
            </button>
          </div>

          <div className="border-2 border-dashed border-sky-200 rounded-xl p-8 text-center bg-sky-50/30 space-y-4">
            <div className="w-12 h-12 rounded-full bg-sky-100 text-sky-600 mx-auto flex items-center justify-center">
              <FileSpreadsheet size={24} />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700">Choose your PAUT inspection workbook (.xlsx, .xls, .csv)</p>
              <p className="text-xs text-slate-400 mt-1">The system will automatically detect tanks, welds, and historical campaigns</p>
            </div>
            <input 
              type="file" 
              accept=".xlsx, .xls, .csv"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              className="mx-auto block text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-sky-600 file:text-white hover:file:bg-sky-700"
            />
            {selectedFile && (
              <p className="text-xs font-bold text-sky-800">Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)</p>
            )}
          </div>

          <div className="flex justify-end">
            <button 
              onClick={handleFileUpload}
              disabled={loading || !selectedFile}
              className="flex items-center space-x-2 bg-sky-600 hover:bg-sky-700 text-white px-6 py-2.5 rounded-lg text-sm font-bold transition-colors disabled:opacity-50"
            >
              <span>{loading ? "Processing Workbook..." : "Inspect & Select Preferences"}</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: TANK & WELD PREFERENCES CENTER */}
      {step === "PREFERENCES" && matrixResult && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <span className="text-xs font-bold px-2.5 py-1 bg-sky-100 text-sky-800 rounded-full uppercase tracking-wider">
              Step 2 of 3
            </span>
            <h3 className="text-xl font-bold text-slate-900 mt-2">Which Tank & Weld do you want to analyze?</h3>
            <p className="text-xs text-slate-500 mt-1">
              Detected <strong>{matrixResult.availableDrums.length} Tanks</strong> and <strong>{matrixResult.availableWelds.length} Welds</strong> across <strong>{matrixResult.campaigns.length} Inspection Campaigns</strong>.
            </p>
          </div>

          {/* 1. Tank / Coke Drum Selector */}
          <div className="space-y-3">
            <label className="block text-sm font-bold text-slate-800">
              1. Select Tank(s) / Coke Drum(s):
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleToggleTank("ALL")}
                className={`px-4 py-2 rounded-lg text-xs font-bold border transition-all ${selectedTanks.includes("ALL") ? "bg-sky-600 text-white border-sky-600 shadow-sm" : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"}`}
              >
                All Tanks ({matrixResult.availableDrums.length})
              </button>
              {matrixResult.availableDrums.map((drum) => {
                const isSelected = selectedTanks.includes(drum);
                return (
                  <button
                    key={drum}
                    onClick={() => handleToggleTank(drum)}
                    className={`px-4 py-2 rounded-lg text-xs font-semibold border transition-all ${isSelected ? "bg-sky-600 text-white border-sky-600 shadow-sm" : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"}`}
                  >
                    Tank {drum}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Weld / Joint Selector */}
          <div className="space-y-3">
            <label className="block text-sm font-bold text-slate-800">
              2. Select Weld Joint(s):
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleToggleWeld("ALL")}
                className={`px-4 py-2 rounded-lg text-xs font-bold border transition-all ${selectedWelds.includes("ALL") ? "bg-indigo-600 text-white border-indigo-600 shadow-sm" : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"}`}
              >
                All Welds ({availableWeldsForSelectedTanks.length})
              </button>
              {availableWeldsForSelectedTanks.map((weld) => {
                const isSelected = selectedWelds.includes(weld);
                return (
                  <button
                    key={weld}
                    onClick={() => handleToggleWeld(weld)}
                    className={`px-4 py-2 rounded-lg text-xs font-semibold border transition-all ${isSelected ? "bg-indigo-600 text-white border-indigo-600 shadow-sm" : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"}`}
                  >
                    Weld Joint {weld}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selection Summary Pill */}
          <div className="p-4 bg-sky-50/70 border border-sky-200 rounded-xl flex items-center justify-between text-xs">
            <div className="space-y-1">
              <p className="text-sky-900 font-bold">Current Target Scope:</p>
              <p className="text-sky-800">
                Tanks: <strong>{selectedTanks.includes("ALL") ? "All Tanks" : selectedTanks.join(", ")}</strong> | Welds: <strong>{selectedWelds.includes("ALL") ? "All Welds" : selectedWelds.join(", ")}</strong>
              </p>
            </div>
            <div className="text-right">
              <span className="text-lg font-bold text-sky-700">{filteredIndications.length}</span>
              <p className="text-[11px] text-slate-500">Tracked Flaw Locations</p>
            </div>
          </div>

          <div className="flex justify-between pt-4">
            <button
              onClick={() => setStep("UPLOAD")}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center space-x-1.5"
            >
              <ArrowLeft size={14} />
              <span>Back</span>
            </button>
            <button
              onClick={() => setStep("VISUALIZATION")}
              className="flex items-center space-x-2 bg-sky-600 hover:bg-sky-700 text-white px-7 py-2.5 rounded-lg text-sm font-bold shadow-sm transition-colors"
            >
              <span>Launch 2D Visualisation & Analysis</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: VISUALISATION & HISTORICAL ANALYSIS VIEW */}
      {step === "VISUALIZATION" && matrixResult && (
        <div className="space-y-6">
          {/* Quick Filters Bar on Top of Visualizer */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
            {/* Quick Tank switcher */}
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-slate-600">Tank:</span>
              <select
                value={selectedTanks[0] || "ALL"}
                onChange={(e) => setSelectedTanks([e.target.value])}
                className="border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-bold text-sky-800 bg-sky-50 focus:ring-1 focus:ring-sky-500 focus:outline-none"
              >
                <option value="ALL">All Tanks</option>
                {matrixResult.availableDrums.map(d => (
                  <option key={d} value={d}>Tank {d}</option>
                ))}
              </select>
            </div>

            {/* Quick Weld switcher */}
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-slate-600">Weld Joint:</span>
              <select
                value={selectedWelds[0] || "ALL"}
                onChange={(e) => setSelectedWelds([e.target.value])}
                className="border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-bold text-indigo-800 bg-indigo-50 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="ALL">All Welds</option>
                {availableWeldsForSelectedTanks.map(w => (
                  <option key={w} value={w}>Joint {w}</option>
                ))}
              </select>
            </div>

            {/* Campaign scrubber */}
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-slate-600">Campaign Timeline:</span>
              <select
                value={selectedCampaign}
                onChange={(e) => setSelectedCampaign(e.target.value)}
                className="border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-50 focus:ring-1 focus:ring-sky-500 focus:outline-none"
              >
                <option value="ALL">All Campaigns (Latest)</option>
                {matrixResult.campaigns.map(c => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
            </div>

            {/* Save to Database action button */}
            <button
              onClick={handleSaveToDatabase}
              disabled={loading}
              className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-sm transition-colors ml-auto"
            >
              <Database size={14} />
              <span>{loading ? "Saving..." : "Save Dataset to Platform"}</span>
            </button>
          </div>

          {/* 2D Circumferential Weld Map Component */}
          <WeldCircumferentialMap
            indications={filteredIndications}
            selectedCampaign={selectedCampaign}
            campaigns={matrixResult.campaigns}
            activeDrumName={selectedTanks.includes("ALL") ? "All Tanks" : selectedTanks.join(", ")}
            activeWeldName={selectedWelds.includes("ALL") ? "All Welds" : selectedWelds.join(", ")}
          />

          {/* Detailed Historical Inspection Observations Matrix Table */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-800">Historical Defect Progression Table</h3>
                <p className="text-xs text-slate-500">
                  Showing {filteredIndications.length} tracked flaw entities across {matrixResult.campaigns.length} campaigns
                </p>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-96">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 text-slate-700 font-semibold sticky top-0 border-b border-slate-200">
                  <tr>
                    <th className="p-3">Flaw Code</th>
                    <th className="p-3">Tank</th>
                    <th className="p-3">Joint</th>
                    <th className="p-3">Segment</th>
                    <th className="p-3">Defect Location</th>
                    {matrixResult.campaigns.map(c => (
                      <th key={c.key} className="p-3 whitespace-nowrap">{c.key} (mm)</th>
                    ))}
                    <th className="p-3 whitespace-nowrap">Growth Delta</th>
                    <th className="p-3 whitespace-nowrap">Annual Rate</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredIndications.map((pi) => (
                    <tr key={pi.code} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="p-3 font-bold text-sky-700">{pi.code}</td>
                      <td className="p-3 font-semibold text-slate-800">{pi.drumName}</td>
                      <td className="p-3 font-medium text-slate-700">{pi.weldName}</td>
                      <td className="p-3 text-slate-500">{pi.segment || "—"}</td>
                      <td className="p-3 font-medium">{pi.locationText}</td>
                      {matrixResult.campaigns.map(c => {
                        const val = pi.campaignValues[c.key]?.length;
                        return (
                          <td key={c.key} className="p-3 text-slate-700 font-semibold">
                            {val !== null && val !== undefined ? `${val} mm` : <span className="text-slate-300">—</span>}
                          </td>
                        );
                      })}
                      <td className="p-3 font-bold">
                        {pi.growthDelta > 0 ? (
                          <span className="text-amber-600">+{pi.growthDelta} mm</span>
                        ) : pi.growthDelta < 0 ? (
                          <span className="text-emerald-600">{pi.growthDelta} mm</span>
                        ) : (
                          <span className="text-slate-400">0 mm</span>
                        )}
                      </td>
                      <td className="p-3">
                        {pi.growthRateYear > 0 ? (
                          <span className="px-2 py-0.5 rounded-full font-bold bg-amber-100 text-amber-800 text-[10px]">
                            +{pi.growthRateYear} mm/yr
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[10px]">Stable</span>
                        )}
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${pi.hasRepairs ? "bg-emerald-100 text-emerald-800" : "bg-sky-100 text-sky-800"}`}>
                          {pi.hasRepairs ? "REPAIRED" : "ACTIVE"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* STEP 4: PERSISTED / SAVED CONFIRMATION */}
      {step === "SAVED" && savedResult && (
        <div className="bg-white rounded-xl border border-emerald-200 p-8 shadow-sm text-center space-y-6">
          <div className="mx-auto w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600">
            <CheckCircle2 size={36} />
          </div>
          <div>
            <h3 className="text-2xl font-bold text-slate-900">Historical Dataset Successfully Saved!</h3>
            <p className="text-sm text-slate-600 mt-2">
              Persisted <strong>{savedResult.campaignsCount}</strong> campaigns, <strong>{savedResult.physicalIndicationsCount}</strong> physical indications, and <strong>{savedResult.observationsCount}</strong> measurements into your database.
            </p>
          </div>

          <div className="flex justify-center space-x-4 pt-4">
            <button
              onClick={() => setStep("VISUALIZATION")}
              className="px-5 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Return to Visualisation
            </button>
            <button
              onClick={() => router.push("/analysis")}
              className="px-6 py-2.5 bg-sky-600 text-white rounded-lg text-sm font-semibold hover:bg-sky-700"
            >
              Open Historical Analysis
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
