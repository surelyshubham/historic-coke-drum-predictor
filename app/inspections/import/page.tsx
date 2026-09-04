"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { 
  getDrumsAndWelds, 
  parseWorkbookFile, 
  validateDatasetAction, 
  commitImportDatasetAction, 
  commitMatrixDatasetAction 
} from "./actions";
import { ValidationError, ObservationImportRow } from "@/lib/validation/importSchema";
import { MatrixParseResult } from "@/lib/import/matrixParser";
import { 
  Upload, 
  CheckCircle2, 
  AlertTriangle, 
  FileSpreadsheet, 
  ArrowRight, 
  ArrowLeft, 
  Layers, 
  FileText, 
  Calendar, 
  Database,
  Sparkles
} from "lucide-react";
import * as XLSX from "xlsx";

const INTERNAL_FIELDS = [
  { key: "sourceIndicationNumber", label: "Indication No / Code", required: true, hint: "e.g. IND-01, 1, A-12" },
  { key: "weldName", label: "Weld Joint Reference", required: true, hint: "e.g. W01, W02, W03, C6" },
  { key: "circumferentialPosition", label: "Circumferential Pos (mm)", required: true, hint: "Clockwise or linear distance along weld" },
  { key: "axialPosition", label: "Axial Position (mm)", required: false, hint: "Offset from weld centerline" },
  { key: "length", label: "Indication Length (mm)", required: true, hint: "Continuous flaw length" },
  { key: "depth", label: "Indication Depth (mm)", required: true, hint: "Flaw through-wall extent" },
  { key: "amplitude", label: "Signal Amplitude (%)", required: false, hint: "PAUT ultrasonic peak amplitude" },
  { key: "indicationType", label: "Indication Type / Class", required: false, hint: "e.g. Crack-like, Porosity, LF" },
];

export default function ImportWizardPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [drums, setDrums] = useState<any[]>([]);
  const [drumWelds, setDrumWelds] = useState<any[]>([]);
  
  // Step 1 State
  const [selectedDrumId, setSelectedDrumId] = useState<number | "">("");
  const [campaignName, setCampaignName] = useState("Sep-2026 PAUT Campaign");
  const [inspectionDate, setInspectionDate] = useState(new Date().toISOString().split("T")[0]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  // Step 2 State
  const [parsedWorkbook, setParsedWorkbook] = useState<any>(null);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [headerRowIdx, setHeaderRowIdx] = useState<number>(0);

  // Matrix Format State (for SEZ multi-campaign matrix like PDF)
  const [isMatrixMode, setIsMatrixMode] = useState(false);
  const [matrixResult, setMatrixResult] = useState<MatrixParseResult | null>(null);
  
  // Step 3 State (Mapping: internalField -> sourceColumn)
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  
  // Step 4 State
  const [validRows, setValidRows] = useState<ObservationImportRow[]>([]);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [totalRowsCount, setTotalRowsCount] = useState(0);

  // Loading States
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [commitResult, setCommitResult] = useState<any>(null);

  useEffect(() => {
    getDrumsAndWelds().then((data) => {
      setDrums(data.drums);
      setDrumWelds(data.welds);
      if (data.drums.length > 0) setSelectedDrumId(data.drums[0].id);
    }).catch(err => setErrorMessage(err.message));
  }, []);

  const autoMapHeaders = (headers: string[]) => {
    const newMapping: Record<string, string> = {};
    headers.forEach((h) => {
      const lower = h.toLowerCase().trim();
      if (!newMapping.sourceIndicationNumber && (lower.includes("ind") || lower.includes("defect") || lower.includes("no.") || lower === "no" || lower === "id" || lower.includes("item"))) {
        newMapping.sourceIndicationNumber = h;
      } else if (!newMapping.weldName && (lower.includes("weld") || lower.includes("joint") || lower.includes("seam"))) {
        newMapping.weldName = h;
      } else if (!newMapping.circumferentialPosition && (lower.includes("circ") || lower.includes("scan") || lower.includes("dist") || lower === "x" || lower === "x (mm)" || lower.includes("pos"))) {
        newMapping.circumferentialPosition = h;
      } else if (!newMapping.axialPosition && (lower.includes("axial") || lower.includes("offset") || lower === "y" || lower === "y (mm)")) {
        newMapping.axialPosition = h;
      } else if (!newMapping.length && (lower.includes("len") || lower === "l" || lower === "l (mm)" || lower.includes("size"))) {
        newMapping.length = h;
      } else if (!newMapping.depth && (lower.includes("dep") || lower === "d" || lower === "d (mm)" || lower.includes("height") || lower === "h")) {
        newMapping.depth = h;
      } else if (!newMapping.amplitude && (lower.includes("amp") || lower.includes("db") || lower.includes("signal"))) {
        newMapping.amplitude = h;
      } else if (!newMapping.indicationType && (lower.includes("type") || lower.includes("class") || lower.includes("flaw") || lower.includes("nature"))) {
        newMapping.indicationType = h;
      }
    });
    setFieldMapping(newMapping);
  };

  // Generate synthetic sample matching user's exact SEZ PAUT multi-campaign spreadsheet
  const generateSezMatrixDemoExcel = () => {
    const matrixRows = [
      {
        "COKE DRUM NO": "C04",
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
        "COKE DRUM NO": "C04",
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
        "COKE DRUM NO": "C04",
        "JOINT NO": "C6",
        "SEGMENT [M]": "9-12",
        "DEFECT LOCATION FROM '0' POINT [MM] MAY-25": "10335-10430",
        "OCT-23 LENGTH [MM]": "NIL",
        "APRIL-24 LENGTH [MM]": "70",
        "SEP-24 LENGTH [MM]": "80",
        "MAY-25 LENGTH [MM]": "95",
        "FEB-2026 LENGTH [MM]": "95",
        "MAY-2026 LENGTH [MM]": "95",
        "SEP-OCT'-25 DEPTH FROM OD [MM]": "2",
        "FEB-26 DEPTH FROM OD [MM]": "2",
        "DEFECT POSITION ON WELD [TOP TOE & BOTTOM TOE]": "30MM BT",
        "INDICATION TYPE": "Crack-like"
      },
      {
        "COKE DRUM NO": "C04",
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
    setCampaignName("Multi-Campaign Historical Summary Matrix");
  };

  // Step 1: Upload & Inspect
  const handleFileUpload = async () => {
    if (!selectedFile || !selectedDrumId) {
      setErrorMessage("Please select a target Coke Drum and an inspection file.");
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
        setHeaderRowIdx(sheetInfo.detectedHeaderRow || 0);

        // Check if matrix format
        if (sheetInfo.isMatrixFormat && sheetInfo.matrixResult) {
          setIsMatrixMode(true);
          setMatrixResult(sheetInfo.matrixResult);
        } else {
          setIsMatrixMode(false);
          autoMapHeaders(sheetInfo.headers);
        }
      }
      setStep(2);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to process file");
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Run Validation on all rows (Single-campaign mode)
  const handleRunValidation = async () => {
    if (!parsedWorkbook || !selectedSheet) return;
    setLoading(true);
    setErrorMessage("");
    try {
      const sheetData = parsedWorkbook.sheetsData[selectedSheet];
      const rawRows = sheetData.allRows || sheetData.sampleRows;
      
      const configuredWeldNames = drumWelds
        .filter(w => w.drumId === Number(selectedDrumId))
        .map(w => w.name);

      const result = await validateDatasetAction(rawRows, fieldMapping, {
        headerRowIndex: headerRowIdx,
        validWeldNames: configuredWeldNames.length > 0 ? configuredWeldNames : undefined,
      });

      setValidRows(result.validRows);
      setValidationErrors(result.errors);
      setTotalRowsCount(result.totalRows);
      setStep(4);
    } catch (err: any) {
      setErrorMessage(err.message || "Validation failed");
    } finally {
      setLoading(false);
    }
  };

  // Commit Matrix Format (all campaigns in one shot)
  const handleCommitMatrix = async () => {
    if (!matrixResult) return;
    setLoading(true);
    setErrorMessage("");
    try {
      const res = await commitMatrixDatasetAction({
        drumId: Number(selectedDrumId),
        filename: parsedWorkbook.filename,
        sizeBytes: parsedWorkbook.sizeBytes,
        mimeType: parsedWorkbook.mimeType,
        matrixResult,
      });
      setCommitResult(res);
      setStep(6);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to commit matrix dataset");
    } finally {
      setLoading(false);
    }
  };

  // Commit Single-Campaign Format
  const handleCommitSingle = async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const res = await commitImportDatasetAction({
        drumId: Number(selectedDrumId),
        campaignName,
        inspectionDate,
        filename: parsedWorkbook.filename,
        sizeBytes: parsedWorkbook.sizeBytes,
        mimeType: parsedWorkbook.mimeType,
        validRows,
      });
      setCommitResult(res);
      setStep(6);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to commit inspection dataset");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Wizard Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Master Data Import Wizard</h2>
            <p className="text-sm text-slate-500">Upload single-campaign PAUT datasets or multi-campaign historical summary spreadsheets</p>
          </div>
          <span className="text-xs font-bold px-3 py-1 bg-sky-100 text-sky-800 rounded-full">
            Step {step} of 6
          </span>
        </div>

        {/* Step Indicator */}
        <div className="grid grid-cols-6 gap-2 mt-6">
          {["Upload", "Inspect", "Map Columns", "Validation", "Preview", "Commit"].map((label, idx) => {
            const stepNum = idx + 1;
            const active = step === stepNum;
            const completed = step > stepNum;
            return (
              <div key={label} className="text-center">
                <div className={`h-2 rounded-full mb-2 transition-all ${completed ? "bg-sky-500" : active ? "bg-sky-400" : "bg-slate-200"}`} />
                <span className={`text-xs font-medium ${active ? "text-sky-700 font-bold" : completed ? "text-slate-700" : "text-slate-400"}`}>
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {errorMessage && (
        <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-700 flex items-center space-x-3 text-sm">
          <AlertTriangle className="shrink-0" size={18} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* STEP 1: UPLOAD METADATA */}
      {step === 1 && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-lg font-semibold text-slate-800">Step 1: Select Metadata & Source Inspection File</h3>
            <button
              onClick={generateSezMatrixDemoExcel}
              className="text-xs font-semibold text-sky-700 bg-sky-50 border border-sky-200 px-3 py-1.5 rounded-lg flex items-center space-x-1.5 hover:bg-sky-100 transition-colors"
            >
              <Sparkles size={14} className="text-sky-600" />
              <span>Load Synthetic SEZ Multi-Campaign File</span>
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Target Coke Drum</label>
              <select 
                value={selectedDrumId} 
                onChange={(e) => setSelectedDrumId(Number(e.target.value))}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-sky-500 focus:outline-none"
              >
                {drums.map(d => (
                  <option key={d.id} value={d.id}>{d.name} — {d.description || "Coke Drum"}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Inspection Campaign Name</label>
              <input 
                type="text" 
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="e.g. Sep-2026 PAUT Campaign" 
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-sky-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Inspection Date</label>
              <input 
                type="date" 
                value={inspectionDate}
                onChange={(e) => setInspectionDate(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-sky-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Inspection Workbook (.xlsx / .csv)</label>
              <input 
                type="file" 
                accept=".xlsx, .xls, .csv"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-sky-50 file:text-sky-700 hover:file:bg-sky-100"
              />
              {selectedFile && (
                <p className="mt-1 text-xs text-sky-700 font-medium">Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)</p>
              )}
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <button 
              onClick={handleFileUpload}
              disabled={loading || !selectedFile}
              className="flex items-center space-x-2 bg-sky-600 hover:bg-sky-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
            >
              <span>{loading ? "Inspecting File..." : "Inspect Workbook"}</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: INSPECT WORKBOOK */}
      {step === 2 && parsedWorkbook && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-6">
          <h3 className="text-lg font-semibold text-slate-800 border-b border-slate-100 pb-3">Step 2: Inspect Workbook Structure</h3>

          {/* Special Banner for SEZ Multi-Campaign Matrix Format */}
          {isMatrixMode && matrixResult && (
            <div className="p-5 bg-gradient-to-r from-sky-50 to-indigo-50 border border-sky-200 rounded-xl space-y-3">
              <div className="flex items-center space-x-3 text-sky-900 font-bold">
                <Sparkles className="text-sky-600" size={20} />
                <span>Historical Multi-Campaign Summary Matrix Detected!</span>
              </div>
              <p className="text-xs text-sky-800 leading-relaxed">
                This workbook matches the <strong>SEZ Coke Drum PAUT Historical Observation Summary</strong> format. It contains multiple chronological inspection campaigns and tracked physical defect locations across joints.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                {matrixResult.campaigns.map(c => (
                  <span key={c.key} className="px-2.5 py-1 rounded-md text-xs font-semibold bg-white border border-sky-200 text-sky-800 shadow-2xs">
                    📅 {c.label}
                  </span>
                ))}
              </div>
              <p className="text-xs font-semibold text-sky-900 pt-1">
                ⚡ Found <strong>{matrixResult.physicalIndications.length}</strong> persistent physical flaw locations with <strong>{matrixResult.observations.length}</strong> campaign measurements.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between bg-slate-50 p-4 rounded-lg border border-slate-200">
            <div className="flex items-center space-x-4">
              <FileSpreadsheet className="text-sky-600" size={24} />
              <div>
                <p className="text-sm font-bold text-slate-800">{parsedWorkbook.filename}</p>
                <p className="text-xs text-slate-500">
                  Size: {(parsedWorkbook.sizeBytes / 1024).toFixed(1)} KB | Sheets: {parsedWorkbook.sheetNames.length} | Rows in Sheet: <strong>{parsedWorkbook.sheetsData[selectedSheet]?.totalRows || 0}</strong>
                </p>
              </div>
            </div>
          </div>

          {/* Sheet Selector */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Select Sheet Containing Data</label>
            <div className="flex flex-wrap gap-2">
              {parsedWorkbook.sheetNames.map((name: string) => (
                <button
                  key={name}
                  onClick={() => {
                    setSelectedSheet(name);
                    const sheetInfo = parsedWorkbook.sheetsData[name];
                    setHeaderRowIdx(sheetInfo.detectedHeaderRow || 0);
                    if (sheetInfo.isMatrixFormat && sheetInfo.matrixResult) {
                      setIsMatrixMode(true);
                      setMatrixResult(sheetInfo.matrixResult);
                    } else {
                      setIsMatrixMode(false);
                      autoMapHeaders(sheetInfo.headers);
                    }
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${selectedSheet === name ? "bg-sky-600 text-white border-sky-600 shadow-sm" : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"}`}
                >
                  {name} ({parsedWorkbook.sheetsData[name]?.totalRows || 0} rows)
                </button>
              ))}
            </div>
          </div>

          {/* Sample Row Preview Table */}
          {selectedSheet && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-slate-700">Sample Row Preview (First 5 Rows)</h4>
                <span className="text-xs text-slate-500">Detected header row: #{headerRowIdx + 1}</span>
              </div>
              <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-56">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 text-slate-700 font-semibold sticky top-0">
                    <tr>
                      {parsedWorkbook.sheetsData[selectedSheet].headers.map((h: string) => (
                        <th key={h} className="p-3 border-b border-slate-200 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsedWorkbook.sheetsData[selectedSheet].sampleRows.map((row: any, rIdx: number) => (
                      <tr key={rIdx} className="border-b border-slate-100 hover:bg-slate-50">
                        {parsedWorkbook.sheetsData[selectedSheet].headers.map((h: string) => (
                          <td key={h} className="p-3 text-slate-800 whitespace-nowrap">{String(row[h] ?? "")}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex justify-between pt-4">
            <button onClick={() => setStep(1)} className="flex items-center space-x-2 px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50">
              <ArrowLeft size={16} />
              <span>Back</span>
            </button>

            {isMatrixMode ? (
              <button 
                onClick={() => setStep(5)} 
                className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-lg text-sm font-bold shadow-sm transition-colors"
              >
                <span>Preview Multi-Campaign Unpivoted History</span>
                <ArrowRight size={16} />
              </button>
            ) : (
              <button onClick={() => setStep(3)} className="flex items-center space-x-2 bg-sky-600 hover:bg-sky-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold">
                <span>Configure Column Mapping</span>
                <ArrowRight size={16} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* STEP 3: COLUMN MAPPING (Only for Single Campaign Mode) */}
      {step === 3 && !isMatrixMode && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-6">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-lg font-semibold text-slate-800">Step 3: Column Mapping</h3>
            <p className="text-xs text-slate-500">Map internal Coke Drum observation fields to the uploaded workbook's column headers.</p>
          </div>

          <div className="divide-y divide-slate-100">
            {INTERNAL_FIELDS.map((field) => {
              return (
                <div key={field.key} className="py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-2">
                  <div className="max-w-md">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-semibold text-slate-800">{field.label}</span>
                      {field.required ? (
                        <span className="text-[10px] font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded">Required</span>
                      ) : (
                        <span className="text-[10px] text-slate-400">Optional</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{field.hint}</p>
                  </div>

                  <select
                    value={fieldMapping[field.key] || ""}
                    onChange={(e) => setFieldMapping({ ...fieldMapping, [field.key]: e.target.value })}
                    className="w-72 rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:ring-1 focus:ring-sky-500 focus:outline-none"
                  >
                    <option value="">-- Select Sheet Column --</option>
                    {parsedWorkbook.sheetsData[selectedSheet].headers.map((h: string) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>

          <div className="flex justify-between pt-4">
            <button onClick={() => setStep(2)} className="flex items-center space-x-2 px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50">
              <ArrowLeft size={16} />
              <span>Back</span>
            </button>
            <button onClick={handleRunValidation} disabled={loading} className="flex items-center space-x-2 bg-sky-600 hover:bg-sky-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold">
              <span>{loading ? "Validating Records..." : "Validate Dataset"}</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: VALIDATION RESULTS (Single Campaign Mode) */}
      {step === 4 && !isMatrixMode && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-6">
          <h3 className="text-lg font-semibold text-slate-800 border-b border-slate-100 pb-3">Step 4: Validation Summary</h3>

          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
              <p className="text-xs font-semibold text-slate-500">Total Rows Examined</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">{totalRowsCount}</p>
            </div>
            <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50">
              <p className="text-xs font-semibold text-emerald-600">Valid Records</p>
              <p className="text-2xl font-bold text-emerald-700 mt-1">{validRows.length}</p>
            </div>
            <div className="p-4 rounded-xl border border-amber-200 bg-amber-50">
              <p className="text-xs font-semibold text-amber-600">Validation Failures</p>
              <p className="text-2xl font-bold text-amber-700 mt-1">{validationErrors.length}</p>
            </div>
          </div>

          {validationErrors.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-bold text-amber-800 flex items-center space-x-2">
                <AlertTriangle size={16} />
                <span>Row Validation Failure Explanations ({validationErrors.length})</span>
              </h4>
              <div className="max-h-56 overflow-y-auto border border-amber-200 rounded-lg bg-amber-50/50 divide-y divide-amber-100">
                {validationErrors.map((err, idx) => (
                  <div key={idx} className="p-3 text-xs text-amber-900 flex items-center justify-between">
                    <div>
                      <span className="font-bold">Row {err.rowNumber}:</span> Field <code className="bg-amber-100 px-1 rounded font-semibold">{err.field}</code> — {err.message}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-between pt-4">
            <button onClick={() => setStep(3)} className="flex items-center space-x-2 px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50">
              <ArrowLeft size={16} />
              <span>Back</span>
            </button>
            <button 
              onClick={() => setStep(5)} 
              disabled={validRows.length === 0} 
              className="flex items-center space-x-2 bg-sky-600 hover:bg-sky-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50"
            >
              <span>Preview Normalized Data ({validRows.length})</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 5: NORMALIZED PREVIEW (Supports both Matrix and Single mode) */}
      {step === 5 && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-800">
                {isMatrixMode ? "Step 5: Preview Unpivoted Multi-Campaign Observations" : "Step 5: Preview Normalized Records"}
              </h3>
              <p className="text-xs text-slate-500">
                {isMatrixMode 
                  ? `Extracted ${matrixResult?.observations.length} observations across ${matrixResult?.campaigns.length} campaigns and ${matrixResult?.physicalIndications.length} physical indications.`
                  : `${validRows.length} valid records ready for database commit.`
                }
              </p>
            </div>
          </div>

          {isMatrixMode && matrixResult ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="p-3 bg-sky-50 rounded-lg border border-sky-200">
                  <p className="text-xs text-sky-700 font-semibold">Campaigns Detected</p>
                  <p className="text-xl font-bold text-sky-900 mt-1">{matrixResult.campaigns.length}</p>
                </div>
                <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-200">
                  <p className="text-xs text-indigo-700 font-semibold">Physical Flaw Entities</p>
                  <p className="text-xl font-bold text-indigo-900 mt-1">{matrixResult.physicalIndications.length}</p>
                </div>
                <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                  <p className="text-xs text-emerald-700 font-semibold">Total Observations</p>
                  <p className="text-xl font-bold text-emerald-900 mt-1">{matrixResult.observations.length}</p>
                </div>
              </div>

              <div className="max-h-80 overflow-y-auto border border-slate-200 rounded-lg">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 text-slate-700 font-semibold sticky top-0">
                    <tr>
                      <th className="p-3 border-b">Campaign</th>
                      <th className="p-3 border-b">Physical Indication Code</th>
                      <th className="p-3 border-b">Joint</th>
                      <th className="p-3 border-b">Segment / Location</th>
                      <th className="p-3 border-b">Length (mm)</th>
                      <th className="p-3 border-b">Depth (mm)</th>
                      <th className="p-3 border-b">Position</th>
                      <th className="p-3 border-b">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matrixResult.observations.slice(0, 50).map((obs, idx) => (
                      <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="p-3 font-semibold text-slate-700">{obs.campaignLabel}</td>
                        <td className="p-3 font-bold text-sky-700">{obs.physicalIndicationCode}</td>
                        <td className="p-3 font-medium">{obs.weldName}</td>
                        <td className="p-3">{obs.locationText || `Segment ${obs.segment}`}</td>
                        <td className="p-3 font-bold text-slate-900">{obs.length} mm</td>
                        <td className="p-3 font-bold text-slate-900">{obs.depth} mm</td>
                        <td className="p-3 text-slate-500">{obs.weldPosition}</td>
                        <td className="p-3">{obs.indicationType}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {matrixResult.observations.length > 50 && (
                <p className="text-[11px] text-slate-400 text-center">Showing first 50 of {matrixResult.observations.length} observations in preview.</p>
              )}
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto border border-slate-200 rounded-lg">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 text-slate-700 font-semibold sticky top-0">
                  <tr>
                    <th className="p-3 border-b">#</th>
                    <th className="p-3 border-b">Indication No</th>
                    <th className="p-3 border-b">Weld Ref</th>
                    <th className="p-3 border-b">Circumferential (mm)</th>
                    <th className="p-3 border-b">Length (mm)</th>
                    <th className="p-3 border-b">Depth (mm)</th>
                    <th className="p-3 border-b">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {validRows.map((row, idx) => (
                    <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="p-3 text-slate-400">{idx + 1}</td>
                      <td className="p-3 font-semibold text-sky-700">{row.sourceIndicationNumber}</td>
                      <td className="p-3 font-medium">{row.weldName}</td>
                      <td className="p-3">{row.circumferentialPosition} mm</td>
                      <td className="p-3 font-bold text-slate-800">{row.length} mm</td>
                      <td className="p-3 font-bold text-slate-800">{row.depth} mm</td>
                      <td className="p-3">{row.indicationType}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex justify-between pt-4">
            <button onClick={() => setStep(isMatrixMode ? 2 : 4)} className="flex items-center space-x-2 px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50">
              <ArrowLeft size={16} />
              <span>Back</span>
            </button>

            {isMatrixMode ? (
              <button 
                onClick={handleCommitMatrix} 
                disabled={loading} 
                className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white px-7 py-2.5 rounded-lg text-sm font-bold shadow-sm transition-colors"
              >
                <CheckCircle2 size={18} />
                <span>{loading ? "Importing All Campaigns..." : `Commit All ${matrixResult?.campaigns.length} Campaigns`}</span>
              </button>
            ) : (
              <button 
                onClick={handleCommitSingle} 
                disabled={loading} 
                className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-lg text-sm font-bold shadow-sm transition-colors"
              >
                <CheckCircle2 size={18} />
                <span>{loading ? "Importing to Database..." : `Commit ${validRows.length} Records`}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* STEP 6: COMMIT CONFIRMATION */}
      {step === 6 && commitResult && (
        <div className="bg-white rounded-xl border border-emerald-200 p-8 shadow-sm text-center space-y-6">
          <div className="mx-auto w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600">
            <CheckCircle2 size={36} />
          </div>
          <div>
            <h3 className="text-2xl font-bold text-slate-900">Historical Inspection Data Successfully Imported!</h3>
            {isMatrixMode ? (
              <p className="text-sm text-slate-600 mt-2">
                Imported <strong>{commitResult.campaignsCount}</strong> inspection campaigns, <strong>{commitResult.physicalIndicationsCount}</strong> persistent physical indications, and <strong>{commitResult.observationsCount}</strong> observations.
              </p>
            ) : (
              <p className="text-sm text-slate-600 mt-2">
                Imported <strong>{commitResult.importedCount}</strong> validated observation records into campaign <strong>{campaignName}</strong>.
              </p>
            )}
          </div>

          <div className="flex justify-center space-x-4 pt-4">
            <button onClick={() => { setStep(1); setMatrixResult(null); setIsMatrixMode(false); }} className="px-5 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50">
              Import Another Dataset
            </button>
            <button onClick={() => router.push("/analysis")} className="px-6 py-2.5 bg-sky-600 text-white rounded-lg text-sm font-semibold hover:bg-sky-700">
              View in Historical Analysis
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
