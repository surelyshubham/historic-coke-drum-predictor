"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getDrumsAndWelds, parseWorkbookFile, validateDatasetAction, commitImportDatasetAction } from "./actions";
import { ValidationError, ObservationImportRow } from "@/lib/validation/importSchema";
import { Upload, CheckCircle2, AlertTriangle, FileSpreadsheet, ArrowRight, ArrowLeft, RefreshCw, FileText, Download } from "lucide-react";
import * as XLSX from "xlsx";

const INTERNAL_FIELDS = [
  { key: "sourceIndicationNumber", label: "Indication No / Code", required: true, hint: "e.g. IND-01, 1, A-12" },
  { key: "weldName", label: "Weld Joint Reference", required: true, hint: "e.g. W01, W02, W03" },
  { key: "circumferentialPosition", label: "Circumferential Pos (mm)", required: true, hint: "Clockwise or linear distance along weld" },
  { key: "axialPosition", label: "Axial Position (mm)", required: false, hint: "Offset from weld centerline" },
  { key: "length", label: "Indication Length (mm)", required: true, hint: "Continuous flaw length" },
  { key: "depth", label: "Indication Depth (mm)", required: true, hint: "Flaw through-wall extent" },
  { key: "amplitude", label: "Signal Amplitude (%)", required: false, hint: "PAUT ultrasonic peak amplitude" },
  { key: "indicationType", label: "Indication Type / Class", required: false, hint: "e.g. Crack-like, Porosity, Lack of fusion" },
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

  // Smart header auto-detection for PAUT inspection columns
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

  // Helper to generate a demo Excel workbook for quick testing
  const generateDemoExcel = () => {
    const demoRows = [
      { "Indication No": "IND-101", "Weld": "W01", "Circ Pos (mm)": "452", "Axial Pos (mm)": "12", "Length (mm)": "15.0", "Depth (mm)": "4.2", "Amplitude (%)": "84", "Type": "Crack-like" },
      { "Indication No": "IND-102", "Weld": "W01", "Circ Pos (mm)": "780", "Axial Pos (mm)": "-5", "Length (mm)": "22.5", "Depth (mm)": "6.1", "Amplitude (%)": "91", "Type": "Crack-like" },
      { "Indication No": "IND-103", "Weld": "W02", "Circ Pos (mm)": "1240", "Axial Pos (mm)": "0", "Length (mm)": "8.5", "Depth (mm)": "2.8", "Amplitude (%)": "76", "Type": "Lack of Fusion" },
      { "Indication No": "IND-104", "Weld": "W02", "Circ Pos (mm)": "1950", "Axial Pos (mm)": "18", "Length (mm)": "31.0", "Depth (mm)": "8.4", "Amplitude (%)": "95", "Type": "Crack-like" },
      { "Indication No": "IND-105", "Weld": "W03", "Circ Pos (mm)": "3100", "Axial Pos (mm)": "8", "Length (mm)": "11.2", "Depth (mm)": "3.9", "Amplitude (%)": "82", "Type": "Porosity" },
    ];
    const ws = XLSX.utils.json_to_sheet(demoRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "PAUT_Observations");
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const file = new File([blob], "Synthetic_C04_PAUT_Campaign.xlsx", { type: blob.type });
    setSelectedFile(file);
  };

  // Step 1: Upload & Inspect
  const handleFileUpload = async () => {
    if (!selectedFile || !selectedDrumId || !campaignName) {
      setErrorMessage("Please complete all required metadata fields and select an inspection file.");
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
        autoMapHeaders(sheetInfo.headers);
      }
      setStep(2);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to process file");
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Run Validation on all rows
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

  // Step 5: Commit to database
  const handleCommit = async () => {
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

  // Helper to get sample text for a column
  const getColumnSample = (colName: string) => {
    if (!parsedWorkbook || !selectedSheet || !colName) return "";
    const samples = parsedWorkbook.sheetsData[selectedSheet]?.sampleRows || [];
    for (const r of samples) {
      if (r[colName] !== undefined && r[colName] !== "") {
        return String(r[colName]);
      }
    }
    return "";
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Wizard Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Master Data Import Wizard</h2>
            <p className="text-sm text-slate-500">Upload, inspect, map, validate, and store Coke Drum PAUT inspection datasets</p>
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
              onClick={generateDemoExcel}
              className="text-xs font-semibold text-sky-600 hover:text-sky-800 bg-sky-50 border border-sky-200 px-3 py-1.5 rounded-lg flex items-center space-x-1.5 hover:bg-sky-100"
            >
              <FileText size={14} />
              <span>Load Synthetic PAUT Sample File</span>
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

          <div className="flex items-center justify-between bg-sky-50/60 p-4 rounded-lg border border-sky-100">
            <div className="flex items-center space-x-4">
              <FileSpreadsheet className="text-sky-600" size={24} />
              <div>
                <p className="text-sm font-bold text-slate-800">{parsedWorkbook.filename}</p>
                <p className="text-xs text-slate-500">
                  Size: {(parsedWorkbook.sizeBytes / 1024).toFixed(1)} KB | Sheets: {parsedWorkbook.sheetNames.length} | Total Records in Sheet: <strong>{parsedWorkbook.sheetsData[selectedSheet]?.totalRows || 0}</strong>
                </p>
              </div>
            </div>
          </div>

          {/* Sheet Selector */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Select Sheet Containing PAUT Observations</label>
            <div className="flex flex-wrap gap-2">
              {parsedWorkbook.sheetNames.map((name: string) => (
                <button
                  key={name}
                  onClick={() => {
                    setSelectedSheet(name);
                    const sheetInfo = parsedWorkbook.sheetsData[name];
                    setHeaderRowIdx(sheetInfo.detectedHeaderRow || 0);
                    autoMapHeaders(sheetInfo.headers);
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
                <span className="text-xs text-slate-500">Auto-detected header row: #{headerRowIdx + 1}</span>
              </div>
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 text-slate-700 font-semibold">
                    <tr>
                      {parsedWorkbook.sheetsData[selectedSheet].headers.map((h: string) => (
                        <th key={h} className="p-3 border-b border-slate-200">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsedWorkbook.sheetsData[selectedSheet].sampleRows.map((row: any, rIdx: number) => (
                      <tr key={rIdx} className="border-b border-slate-100 hover:bg-slate-50">
                        {parsedWorkbook.sheetsData[selectedSheet].headers.map((h: string) => (
                          <td key={h} className="p-3 text-slate-800">{String(row[h] ?? "")}</td>
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
            <button onClick={() => setStep(3)} className="flex items-center space-x-2 bg-sky-600 hover:bg-sky-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold">
              <span>Proceed to Column Mapping</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: COLUMN MAPPING */}
      {step === 3 && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-6">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-lg font-semibold text-slate-800">Step 3: Column Mapping</h3>
            <p className="text-xs text-slate-500">Map internal Coke Drum observation fields to the uploaded workbook's column headers. Sample values from your file are displayed beside each selection.</p>
          </div>

          <div className="divide-y divide-slate-100">
            {INTERNAL_FIELDS.map((field) => {
              const mappedCol = fieldMapping[field.key];
              const sampleVal = getColumnSample(mappedCol);

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

                  <div className="flex items-center space-x-3">
                    {sampleVal && (
                      <span className="text-xs text-sky-700 bg-sky-50 border border-sky-100 px-2 py-1 rounded max-w-xs truncate">
                        Sample: <strong>"{sampleVal}"</strong>
                      </span>
                    )}
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
              <span>{loading ? "Validating Records..." : "Validate Entire Dataset"}</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: VALIDATION RESULTS */}
      {step === 4 && (
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
                    {err.receivedValue && (
                      <span className="text-[10px] text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded ml-2">
                        Received: "{err.receivedValue}"
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-between pt-4">
            <button onClick={() => setStep(3)} className="flex items-center space-x-2 px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50">
              <ArrowLeft size={16} />
              <span>Back to Mapping</span>
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

      {/* STEP 5: NORMALIZED PREVIEW */}
      {step === 5 && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-lg font-semibold text-slate-800">Step 5: Preview Normalized Records ({validRows.length})</h3>
            <span className="text-xs text-slate-500">
              Total Defect Length: <strong>{validRows.reduce((a, b) => a + b.length, 0).toFixed(1)} mm</strong>
            </span>
          </div>

          <div className="max-h-80 overflow-y-auto border border-slate-200 rounded-lg">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100 text-slate-700 font-semibold sticky top-0">
                <tr>
                  <th className="p-3 border-b">#</th>
                  <th className="p-3 border-b">Indication No</th>
                  <th className="p-3 border-b">Weld Ref</th>
                  <th className="p-3 border-b">Circumferential (mm)</th>
                  <th className="p-3 border-b">Axial (mm)</th>
                  <th className="p-3 border-b">Length (mm)</th>
                  <th className="p-3 border-b">Depth (mm)</th>
                  <th className="p-3 border-b">Amplitude</th>
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
                    <td className="p-3 text-slate-500">{row.axialPosition !== null && row.axialPosition !== undefined ? `${row.axialPosition} mm` : "—"}</td>
                    <td className="p-3 font-bold text-slate-800">{row.length} mm</td>
                    <td className="p-3 font-bold text-slate-800">{row.depth} mm</td>
                    <td className="p-3 text-slate-500">{row.amplitude ? `${row.amplitude}%` : "—"}</td>
                    <td className="p-3">{row.indicationType}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between pt-4">
            <button onClick={() => setStep(4)} className="flex items-center space-x-2 px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50">
              <ArrowLeft size={16} />
              <span>Back</span>
            </button>
            <button onClick={handleCommit} disabled={loading} className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-lg text-sm font-bold shadow-sm transition-colors">
              <CheckCircle2 size={18} />
              <span>{loading ? "Importing to Database..." : `Commit ${validRows.length} Records`}</span>
            </button>
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
            <h3 className="text-2xl font-bold text-slate-900">Inspection Dataset Successfully Imported!</h3>
            <p className="text-sm text-slate-500 mt-2">
              Imported <strong>{commitResult.importedCount}</strong> validated observation records into campaign <strong>{campaignName}</strong>.
            </p>
          </div>

          <div className="flex justify-center space-x-4 pt-4">
            <button onClick={() => setStep(1)} className="px-5 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50">
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
