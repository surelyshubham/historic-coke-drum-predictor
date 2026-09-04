"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getDrumsAndWelds, parseWorkbookFile, validateDatasetAction, commitImportDatasetAction } from "./actions";
import { ValidationError, ObservationImportRow } from "@/lib/validation/importSchema";
import { Upload, CheckCircle2, AlertTriangle, FileSpreadsheet, ArrowRight, ArrowLeft, Database, Layers } from "lucide-react";

const INTERNAL_FIELDS = [
  { key: "sourceIndicationNumber", label: "Indication No / Code", required: true },
  { key: "weldName", label: "Weld Joint Reference", required: true },
  { key: "circumferentialPosition", label: "Circumferential Pos (mm)", required: true },
  { key: "axialPosition", label: "Axial Position (mm)", required: false },
  { key: "length", label: "Indication Length (mm)", required: true },
  { key: "depth", label: "Indication Depth (mm)", required: true },
  { key: "amplitude", label: "Signal Amplitude (%)", required: false },
  { key: "indicationType", label: "Indication Type / Class", required: false },
];

export default function ImportWizardPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [drums, setDrums] = useState<any[]>([]);
  
  // Step 1 State
  const [selectedDrumId, setSelectedDrumId] = useState<number | "">("");
  const [campaignName, setCampaignName] = useState("");
  const [inspectionDate, setInspectionDate] = useState(new Date().toISOString().split("T")[0]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  // Step 2 State
  const [parsedWorkbook, setParsedWorkbook] = useState<any>(null);
  const [selectedSheet, setSelectedSheet] = useState("");
  
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
      if (data.drums.length > 0) setSelectedDrumId(data.drums[0].id);
    }).catch(err => setErrorMessage(err.message));
  }, []);

  // Auto-suggest column mappings based on header names
  const autoMapHeaders = (headers: string[]) => {
    const newMapping: Record<string, string> = {};
    headers.forEach((h) => {
      const lower = h.toLowerCase();
      if (lower.includes("ind") || lower.includes("no") || lower.includes("code")) newMapping.sourceIndicationNumber = h;
      else if (lower.includes("weld") || lower.includes("joint")) newMapping.weldName = h;
      else if (lower.includes("circ") || lower.includes("pos") || lower.includes("scan")) newMapping.circumferentialPosition = h;
      else if (lower.includes("axial")) newMapping.axialPosition = h;
      else if (lower.includes("len")) newMapping.length = h;
      else if (lower.includes("dep")) newMapping.depth = h;
      else if (lower.includes("amp")) newMapping.amplitude = h;
      else if (lower.includes("type") || lower.includes("class")) newMapping.indicationType = h;
    });
    setFieldMapping(newMapping);
  };

  // Step 1 submit: parse file
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
        autoMapHeaders(res.sheetsData[firstSheet].headers);
      }
      setStep(2);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to process file");
    } finally {
      setLoading(false);
    }
  };

  // Step 3 submit: validate mapped data
  const handleRunValidation = async () => {
    if (!parsedWorkbook || !selectedSheet) return;
    setLoading(true);
    setErrorMessage("");
    try {
      const rawRows = parsedWorkbook.sheetsData[selectedSheet].rows;
      const result = await validateDatasetAction(rawRows, fieldMapping);
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

  // Step 5 submit: commit to database
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

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Page Title & Wizard Progress Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Master Data Import Wizard</h2>
            <p className="text-sm text-slate-500">Upload, map, validate, and import Coke Drum PAUT inspection datasets</p>
          </div>
          <span className="text-xs font-semibold px-3 py-1 bg-sky-100 text-sky-800 rounded-full">
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
                <div className={`h-2 rounded-full mb-2 ${completed ? "bg-sky-500" : active ? "bg-sky-400" : "bg-slate-200"}`} />
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
          <h3 className="text-lg font-semibold text-slate-800 border-b border-slate-100 pb-3">Step 1: Select Metadata & Source File</h3>
          
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
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <button 
              onClick={handleFileUpload}
              disabled={loading}
              className="flex items-center space-x-2 bg-sky-600 hover:bg-sky-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
            >
              <span>{loading ? "Processing File..." : "Inspect Workbook"}</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: INSPECT WORKBOOK */}
      {step === 2 && parsedWorkbook && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-6">
          <h3 className="text-lg font-semibold text-slate-800 border-b border-slate-100 pb-3">Step 2: Inspect Workbook Sheets</h3>

          <div className="flex items-center space-x-4 bg-sky-50/60 p-4 rounded-lg border border-sky-100">
            <FileSpreadsheet className="text-sky-600" size={24} />
            <div>
              <p className="text-sm font-bold text-slate-800">{parsedWorkbook.filename}</p>
              <p className="text-xs text-slate-500">Size: {(parsedWorkbook.sizeBytes / 1024).toFixed(1)} KB | Sheets detected: {parsedWorkbook.sheetNames.length}</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Select Sheet to Import</label>
            <div className="flex space-x-2">
              {parsedWorkbook.sheetNames.map((name: string) => (
                <button
                  key={name}
                  onClick={() => {
                    setSelectedSheet(name);
                    autoMapHeaders(parsedWorkbook.sheetsData[name].headers);
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${selectedSheet === name ? "bg-sky-600 text-white border-sky-600" : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"}`}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          {selectedSheet && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-slate-700">Sample Row Preview (First 5 Rows)</h4>
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
                    {parsedWorkbook.sheetsData[selectedSheet].rows.slice(0, 5).map((row: any, rIdx: number) => (
                      <tr key={rIdx} className="border-b border-slate-100 hover:bg-slate-50">
                        {parsedWorkbook.sheetsData[selectedSheet].headers.map((h: string) => (
                          <td key={h} className="p-3">{String(row[h] ?? "")}</td>
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
              <span>Configure Column Mapping</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: COLUMN MAPPING */}
      {step === 3 && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-6">
          <h3 className="text-lg font-semibold text-slate-800 border-b border-slate-100 pb-3">Step 3: Column Mapping</h3>
          <p className="text-xs text-slate-500">Map internal Coke Drum observation fields to the uploaded workbook's column headers.</p>

          <div className="divide-y divide-slate-100">
            {INTERNAL_FIELDS.map((field) => (
              <div key={field.key} className="py-3 flex items-center justify-between">
                <div>
                  <span className="text-sm font-semibold text-slate-800">{field.label}</span>
                  {field.required && <span className="text-red-500 ml-1 text-xs">*Required</span>}
                </div>
                <select
                  value={fieldMapping[field.key] || ""}
                  onChange={(e) => setFieldMapping({ ...fieldMapping, [field.key]: e.target.value })}
                  className="w-64 rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:ring-1 focus:ring-sky-500 focus:outline-none"
                >
                  <option value="">-- Select Sheet Column --</option>
                  {parsedWorkbook.sheetsData[selectedSheet].headers.map((h: string) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div className="flex justify-between pt-4">
            <button onClick={() => setStep(2)} className="flex items-center space-x-2 px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50">
              <ArrowLeft size={16} />
              <span>Back</span>
            </button>
            <button onClick={handleRunValidation} disabled={loading} className="flex items-center space-x-2 bg-sky-600 hover:bg-sky-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold">
              <span>{loading ? "Validating..." : "Validate Dataset"}</span>
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
              <p className="text-xs font-semibold text-slate-500">Total Rows Processed</p>
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
                <span>Row Validation Failure Explanations</span>
              </h4>
              <div className="max-h-48 overflow-y-auto border border-amber-200 rounded-lg bg-amber-50/50 divide-y divide-amber-100">
                {validationErrors.map((err, idx) => (
                  <div key={idx} className="p-3 text-xs text-amber-900">
                    <span className="font-bold">Row {err.rowNumber}:</span> Field <code className="bg-amber-100 px-1 rounded">{err.field}</code> — {err.message}
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
            <button onClick={() => setStep(5)} disabled={validRows.length === 0} className="flex items-center space-x-2 bg-sky-600 hover:bg-sky-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50">
              <span>Preview Normalized Data</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 5: NORMALIZED PREVIEW */}
      {step === 5 && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-6">
          <h3 className="text-lg font-semibold text-slate-800 border-b border-slate-100 pb-3">Step 5: Preview Normalized Records ({validRows.length})</h3>

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

          <div className="flex justify-between pt-4">
            <button onClick={() => setStep(4)} className="flex items-center space-x-2 px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50">
              <ArrowLeft size={16} />
              <span>Back</span>
            </button>
            <button onClick={handleCommit} disabled={loading} className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-lg text-sm font-bold shadow-sm transition-colors">
              <CheckCircle2 size={18} />
              <span>{loading ? "Importing to Database..." : "Commit Dataset"}</span>
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
            <button onClick={() => router.push("/dashboard")} className="px-6 py-2.5 bg-sky-600 text-white rounded-lg text-sm font-semibold hover:bg-sky-700">
              Go to Dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
