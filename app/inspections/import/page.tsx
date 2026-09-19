"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { 
  getDrumsAndWelds, 
  parseWorkbookFile, 
  commitMatrixDatasetAction,
  commitImportDatasetAction,
  getClientsForImportAction
} from "./actions";
import { MatrixParseResult, TrackedPhysicalIndication } from "@/lib/import/matrixParser";
import { 
  saveDatasetToVault, 
  setActiveVaultDatasetId, 
  getAllVaultDatasets, 
  getDatasetFromVault, 
  deleteDatasetFromVault,
  VaultDataset, 
  VaultDatasetSummary 
} from "@/lib/vault/datasetVault";
import { RepairZone, DisappearedFlawAnomaly } from "@/types/repair";
import { RepairAnomalyModal } from "@/components/repair/RepairAnomalyModal";
import { RenameJointModal } from "@/components/repair/RenameJointModal";
import { WeldCircumferentialMap } from "@/components/visualization/weldCircumferentialMap";
import { PredictiveForecastChart } from "@/components/visualization/predictiveForecastChart";
import { WeldWidthPlanPlot } from "@/components/visualization/WeldWidthPlanPlot";
import { PolarCircumferentialRingMap } from "@/components/visualization/PolarCircumferentialRingMap";
import { WeldBevelSScanProfile } from "@/components/visualization/WeldBevelSScanProfile";
import { HistoricalMeasurement } from "@/lib/prediction/growthModel";
import { 
  BevelJointType, 
  detectBevelTypeFromWeldName, 
  getBevelDefinition, 
  ALL_BEVEL_TYPES, 
  BEVEL_DEFINITIONS 
} from "@/lib/bevel/bevelClassifier";
import Link from "next/link";
import { 
  Upload, 
  CheckCircle2, 
  AlertTriangle, 
  FileSpreadsheet, 
  ArrowRight, 
  ArrowLeft, 
  Archive,
  HardDrive, 
  Filter, 
  FileText, 
  Sparkles, 
  Database, 
  Sliders, 
  TrendingUp, 
  Download,
  CircleDot,
  Maximize2,
  Crosshair,
  Layers,
  Trash2,
  Wrench,
  Pencil,
  Building,
  Info,
  AlertCircle,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  ShieldAlert,
  Loader2
} from "lucide-react";
import * as XLSX from "xlsx";

export default function ImportWizardPage() {
  const router = useRouter();
  const [step, setStep] = useState<"UPLOAD" | "PREFERENCES" | "VISUALIZATION" | "SAVED">("UPLOAD");
  const [drums, setDrums] = useState<any[]>([]);
  const [selectedDrumId, setSelectedDrumId] = useState<number>(1);

  // Target Client Selection State
  const [clientsList, setClientsList] = useState<Array<{ id: number; name: string; description?: string | null }>>([]);
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);

  // File Upload State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedWorkbook, setParsedWorkbook] = useState<any>(null);
  const [selectedSheet, setSelectedSheet] = useState("");

  // Multi-Campaign Matrix State
  const [matrixResult, setMatrixResult] = useState<MatrixParseResult | null>(null);

  // Coke Drum & Weld Selection Preferences
  const [selectedDrums, setSelectedDrums] = useState<string[]>([]); // ["ALL"] or ["R01", "R02", ...]
  const [selectedWelds, setSelectedWelds] = useState<string[]>([]); // ["ALL"] or ["C6", ...]
  const [selectedCampaign, setSelectedCampaign] = useState<string>("ALL"); // "ALL" or specific campaign key
  const [visualizerTab, setVisualizerTab] = useState<"POLAR_RING" | "WELD_WIDTH" | "BEVEL_SLICE" | "GROWTH_CURVE" | "UNROLLED_RIBBON">("POLAR_RING");
  const [layoutMode, setLayoutMode] = useState<"SPLIT" | "CANVAS_ONLY" | "TABLE_ONLY">("SPLIT");

  // Custom Joint Display Names
  const [jointAliases, setJointAliases] = useState<Record<string, string>>({});
  const [showRenameModal, setShowRenameModal] = useState<boolean>(false);

  // Configurable Drum & Weld Joint Specifications (Master / Defaults)
  const [nominalWallThickness, setNominalWallThickness] = useState<number>(32.0);
  const [cladThickness, setCladThickness] = useState<number>(3.0);
  const [jointDegrees, setJointDegrees] = useState<number>(60.0);
  const [showSpecsModal, setShowSpecsModal] = useState<boolean>(false);

  // Master Buffer Inputs for Step 2 Bulk Apply
  const [masterWallThickness, setMasterWallThickness] = useState<string>("32.0");
  const [masterCladThickness, setMasterCladThickness] = useState<string>("3.0");
  const [masterJointDegrees, setMasterJointDegrees] = useState<string>("60.0");

  // Per-Weld Specifications: individual entry for each weld seam (e.g. C1, C2)
  const [weldSpecs, setWeldSpecs] = useState<Record<string, { wallThickness: string; cladThickness: string; jointDegrees: string; bevelType?: BevelJointType }>>({});

  // Quick Tuner Modal Local State
  const [specModalWall, setSpecModalWall] = useState<string>("32.0");
  const [specModalClad, setSpecModalClad] = useState<string>("3.0");
  const [specModalDegrees, setSpecModalDegrees] = useState<string>("60.0");

  const getJointDisplayName = (weldKey: string) => {
    if (!weldKey) return "";
    if (weldKey === "ALL") return "All Welds";
    return jointAliases[weldKey] || `Joint ${weldKey}`;
  };

  // Loading & Action states
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [savedResult, setSavedResult] = useState<any>(null);
  const [vaultDatasets, setVaultDatasets] = useState<VaultDatasetSummary[]>([]);

  // Diagnostics & Debug State
  const [sessionDiagnostic, setSessionDiagnostic] = useState<any>(null);
  const [diagnosticLoading, setDiagnosticLoading] = useState(false);
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [showDebugDetails, setShowDebugDetails] = useState(false);
  const [saveProgressText, setSaveProgressText] = useState("");
  const [copiedDebug, setCopiedDebug] = useState(false);

  // Repair & Replaced Sections State
  const [repairZones, setRepairZones] = useState<RepairZone[]>([]);
  const [anomalies, setAnomalies] = useState<DisappearedFlawAnomaly[]>([]);
  const [showRepairModal, setShowRepairModal] = useState<boolean>(false);

  const checkAndSetAnomalies = (matrix: MatrixParseResult) => {
    if (!matrix || matrix.campaigns.length < 2) return;
    const sorted = [...matrix.campaigns].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    const latest = sorted[sorted.length - 1];
    const found: DisappearedFlawAnomaly[] = [];

    matrix.physicalIndications.forEach((pi) => {
      const latestVal = pi.campaignValues[latest.key];
      const hasLatest = latestVal && typeof latestVal.length === "number" && latestVal.length > 0;
      if (!hasLatest && !pi.hasRepairs) {
        for (let i = sorted.length - 2; i >= 0; i--) {
          const prev = sorted[i];
          const prevVal = pi.campaignValues[prev.key];
          if (prevVal && typeof prevVal.length === "number" && prevVal.length > 0) {
            found.push({
              indicationCode: pi.code,
              weldName: pi.weldName,
              drumName: pi.drumName,
              approximateLocationMm: pi.circumferentialPosition || 0,
              detectedLengthMm: prevVal.length,
              lastObservedCampaign: prev.label || prev.key,
              lastObservedDate: prev.date,
              missingInCampaign: latest.label || latest.key,
              suggestedStartMm: Math.max(0, (pi.circumferentialPosition || 0) - 200),
              suggestedEndMm: (pi.circumferentialPosition || 0) + prevVal.length + 200,
            });
            break;
          }
        }
      }
    });
    setAnomalies(found);
    if (found.length > 0) {
      setShowRepairModal(true);
    }
  };

  const runDiagnosticCheck = async () => {
    setDiagnosticLoading(true);
    try {
      const res = await fetch("/api/debug/auth-check");
      if (res.ok) {
        const data = await res.json();
        setSessionDiagnostic(data);
      }
    } catch (e) {
      console.warn("Diagnostic fetch notice:", e);
    } finally {
      setDiagnosticLoading(false);
    }
  };

  useEffect(() => {
    runDiagnosticCheck();

    getDrumsAndWelds()
      .then((data) => {
        setDrums(data.drums);
        if (data.drums.length > 0) setSelectedDrumId(data.drums[0].id);
      })
      .catch((err) => console.warn("Drums notice:", err.message));

    getClientsForImportAction()
      .then((cls) => {
        setClientsList(cls);
        if (cls.length > 0) {
          setSelectedClientId(cls[0].id);
        }
      })
      .catch((err) => console.warn("Clients notice:", err.message));

    loadVaultDatasets();
  }, []);

  const loadVaultDatasets = async () => {
    try {
      const list = await getAllVaultDatasets();
      setVaultDatasets(list);
    } catch (e) {
      console.warn("Vault list error:", e);
    }
  };

  const handleLoadVaultDataset = async (id: string) => {
    setLoading(true);
    setErrorMessage("");
    try {
      const ds = await getDatasetFromVault(id);
      if (ds && ds.matrixResult) {
        setMatrixResult(ds.matrixResult);
        if (ds.repairZones) setRepairZones(ds.repairZones);
        if (ds.jointAliases) setJointAliases(ds.jointAliases);
        if (typeof ds.nominalWallThickness === "number") {
          setNominalWallThickness(ds.nominalWallThickness);
          setMasterWallThickness(String(ds.nominalWallThickness));
        }
        if (typeof ds.cladThickness === "number") {
          setCladThickness(ds.cladThickness);
          setMasterCladThickness(String(ds.cladThickness));
        }
        if (typeof ds.jointDegrees === "number") {
          setJointDegrees(ds.jointDegrees);
          setMasterJointDegrees(String(ds.jointDegrees));
        }
        if (ds.weldSpecs) {
          const restored: Record<string, { wallThickness: string; cladThickness: string; jointDegrees: string; bevelType?: BevelJointType }> = {};
          Object.entries(ds.weldSpecs).forEach(([w, spec]) => {
            restored[w] = {
              wallThickness: String(spec.nominalWallThickness),
              cladThickness: String(spec.cladThickness),
              jointDegrees: String(spec.jointDegrees),
              bevelType: spec.bevelType || detectBevelTypeFromWeldName(w),
            };
          });
          setWeldSpecs(restored);
        }
        setSelectedDrums(ds.activeDrum ? [ds.activeDrum] : ["ALL"]);
        setSelectedWelds(ds.activeWeld ? [ds.activeWeld] : ["ALL"]);
        await setActiveVaultDatasetId(id);
        await loadVaultDatasets();
        checkAndSetAnomalies(ds.matrixResult);
        setStep("PREFERENCES");
      } else {
        setErrorMessage("Dataset not found in Vault.");
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to load dataset from Vault");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteVaultDataset = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to remove this dataset from your local Vault?")) return;
    try {
      await deleteDatasetFromVault(id);
      await loadVaultDatasets();
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to delete dataset from Vault");
    }
  };

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
          // Default selection to "ALL" coke drums and "ALL" welds
          setSelectedDrums(["ALL"]);
          setSelectedWelds(["ALL"]);
          checkAndSetAnomalies(sheetInfo.matrixResult);
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

  // Toggle Coke Drum selection
  const handleToggleDrum = (drum: string) => {
    if (drum === "ALL") {
      setSelectedDrums(["ALL"]);
      return;
    }
    let updated = selectedDrums.filter(t => t !== "ALL");
    if (updated.includes(drum)) {
      updated = updated.filter(t => t !== drum);
      if (updated.length === 0) updated = ["ALL"];
    } else {
      updated.push(drum);
    }
    setSelectedDrums(updated);
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

  // Filter physical indications by selected Coke Drums and Welds
  const filteredIndications = (matrixResult?.physicalIndications || []).filter(pi => {
    const drumMatch = selectedDrums.includes("ALL") || selectedDrums.includes(pi.drumName);
    const weldMatch = selectedWelds.includes("ALL") || selectedWelds.includes(pi.weldName);
    return drumMatch && weldMatch;
  });

  const [selectedFlawForForecast, setSelectedFlawForForecast] = useState<TrackedPhysicalIndication | null>(null);

  // Active flaw for predictive forecast
  const activeFlaw = selectedFlawForForecast && filteredIndications.some(i => i.code === selectedFlawForForecast.code)
    ? selectedFlawForForecast
    : (filteredIndications[0] || null);

  const getMeasurementsForFlaw = (pi: TrackedPhysicalIndication): HistoricalMeasurement[] => {
    if (!matrixResult) return [];
    const ms: HistoricalMeasurement[] = [];
    for (const c of matrixResult.campaigns) {
      const val = pi.campaignValues[c.key];
      if (val && val.length !== null && val.length > 0) {
        ms.push({
          date: new Date(c.date || "2024-01-01"),
          campaignName: c.label || c.key,
          length: val.length,
          depth: val.depth ?? (pi.latestDepth || 2.0),
          circumferentialPosition: pi.circumferentialPosition,
        });
      }
    }
    if (ms.length === 0) {
      ms.push({
        date: new Date(),
        campaignName: "Current",
        length: pi.latestLength || 50,
        depth: pi.latestDepth || 2.0,
        circumferentialPosition: pi.circumferentialPosition,
      });
    }
    return ms;
  };

  // Natural sort helper so welds appear as C1, C2, ..., C9, C10 instead of C1, C10, C2
  const naturalSortWelds = (welds: string[]) => {
    return [...welds].sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, ""), 10);
      const numB = parseInt(b.replace(/\D/g, ""), 10);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
    });
  };

  // Available welds for selected Coke Drums
  const availableWeldsForSelectedDrums = useMemo(() => {
    if (!matrixResult) return [];
    const raw = Array.from(new Set(
      matrixResult.physicalIndications
        .filter(pi => selectedDrums.includes("ALL") || selectedDrums.includes(pi.drumName))
        .map(pi => pi.weldName)
    ));
    return naturalSortWelds(raw);
  }, [matrixResult, selectedDrums]);

  // Synchronize available welds into weldSpecs state
  useEffect(() => {
    if (availableWeldsForSelectedDrums.length > 0) {
      setWeldSpecs((prev) => {
        const next = { ...prev };
        let changed = false;
        availableWeldsForSelectedDrums.forEach((w) => {
          if (!next[w]) {
            const autoBevel = detectBevelTypeFromWeldName(w);
            const def = getBevelDefinition(autoBevel);
            next[w] = {
              wallThickness: masterWallThickness || String(def.defaultWallThicknessMm || nominalWallThickness),
              cladThickness: masterCladThickness || String(def.defaultCladThicknessMm),
              jointDegrees: masterJointDegrees || String(def.grooveAngleDeg),
              bevelType: autoBevel,
            };
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }
  }, [availableWeldsForSelectedDrums]);

  // Get numeric specifications for a given weld seam (or fallback to master/defaults)
  const getNumericWeldSpec = (weldKey?: string | null) => {
    const autoBevel = detectBevelTypeFromWeldName(weldKey);
    if (weldKey && weldSpecs[weldKey]) {
      const spec = weldSpecs[weldKey];
      const wall = parseFloat(spec.wallThickness);
      const clad = parseFloat(spec.cladThickness);
      const deg = parseFloat(spec.jointDegrees);
      return {
        wallThickness: !isNaN(wall) && wall > 0 ? wall : nominalWallThickness,
        cladThickness: !isNaN(clad) && clad >= 0 ? clad : cladThickness,
        jointDegrees: !isNaN(deg) && deg > 0 ? deg : jointDegrees,
        bevelType: spec.bevelType || autoBevel,
      };
    }
    const def = getBevelDefinition(autoBevel);
    return {
      wallThickness: def.defaultWallThicknessMm || nominalWallThickness,
      cladThickness: def.defaultCladThicknessMm,
      jointDegrees: def.grooveAngleDeg || jointDegrees,
      bevelType: autoBevel,
    };
  };

  const handleUpdateWeldSpec = (weldKey: string, field: "wallThickness" | "cladThickness" | "jointDegrees", value: string) => {
    setWeldSpecs((prev) => ({
      ...prev,
      [weldKey]: {
        ...(prev[weldKey] || {
          wallThickness: masterWallThickness,
          cladThickness: masterCladThickness,
          jointDegrees: masterJointDegrees,
          bevelType: detectBevelTypeFromWeldName(weldKey),
        }),
        [field]: value,
      },
    }));
  };

  const handleUpdateWeldBevelType = (weldKey: string, newBevelType: BevelJointType) => {
    const def = getBevelDefinition(newBevelType);
    setWeldSpecs((prev) => ({
      ...prev,
      [weldKey]: {
        ...(prev[weldKey] || {}),
        bevelType: newBevelType,
        wallThickness: String(def.defaultWallThicknessMm),
        cladThickness: String(def.defaultCladThicknessMm),
        jointDegrees: String(def.grooveAngleDeg),
      },
    }));
  };

  const handleBatchApplyBevelType = (targetBevelType: BevelJointType) => {
    const def = getBevelDefinition(targetBevelType);
    setWeldSpecs((prev) => {
      const next = { ...prev };
      availableWeldsForSelectedDrums.forEach((w) => {
        next[w] = {
          ...(next[w] || {}),
          bevelType: targetBevelType,
          wallThickness: String(def.defaultWallThicknessMm),
          cladThickness: String(def.defaultCladThicknessMm),
          jointDegrees: String(def.grooveAngleDeg),
        };
      });
      return next;
    });
  };

  const handleAutoDetectAllBevels = () => {
    setWeldSpecs((prev) => {
      const next = { ...prev };
      availableWeldsForSelectedDrums.forEach((w) => {
        const bType = detectBevelTypeFromWeldName(w);
        const def = getBevelDefinition(bType);
        next[w] = {
          ...(next[w] || {}),
          bevelType: bType,
          wallThickness: String(def.defaultWallThicknessMm),
          cladThickness: String(def.defaultCladThicknessMm),
          jointDegrees: String(def.grooveAngleDeg),
        };
      });
      return next;
    });
  };

  const handleResetWeldToMaster = (weldKey: string) => {
    const autoBevel = detectBevelTypeFromWeldName(weldKey);
    const def = getBevelDefinition(autoBevel);
    setWeldSpecs((prev) => ({
      ...prev,
      [weldKey]: {
        wallThickness: masterWallThickness || String(def.defaultWallThicknessMm),
        cladThickness: masterCladThickness || String(def.defaultCladThicknessMm),
        jointDegrees: masterJointDegrees || String(def.grooveAngleDeg),
        bevelType: autoBevel,
      },
    }));
  };

  const handleApplyMasterToAllWelds = () => {
    const wall = masterWallThickness.trim() || "32.0";
    const clad = masterCladThickness.trim() || "3.0";
    const deg = masterJointDegrees.trim() || "60.0";

    const parsedWall = parseFloat(wall) || 32.0;
    const parsedClad = parseFloat(clad) || 3.0;
    const parsedDeg = parseFloat(deg) || 60.0;

    setNominalWallThickness(parsedWall);
    setCladThickness(parsedClad);
    setJointDegrees(parsedDeg);

    setWeldSpecs((prev) => {
      const next = { ...prev };
      availableWeldsForSelectedDrums.forEach((w) => {
        next[w] = {
          ...(next[w] || { bevelType: detectBevelTypeFromWeldName(w) }),
          wallThickness: wall,
          cladThickness: clad,
          jointDegrees: deg,
        };
      });
      return next;
    });
  };

  const effectiveWeldKey = activeFlaw?.weldName || (selectedWelds.length === 1 && selectedWelds[0] !== "ALL" ? selectedWelds[0] : (availableWeldsForSelectedDrums[0] || null));
  const activeSpec = getNumericWeldSpec(effectiveWeldKey);

  const openSpecsModal = () => {
    const spec = getNumericWeldSpec(effectiveWeldKey);
    setSpecModalWall(String(spec.wallThickness));
    setSpecModalClad(String(spec.cladThickness));
    setSpecModalDegrees(String(spec.jointDegrees));
    setShowSpecsModal(true);
  };

  // Save to Local Vault & Database via Chunked Streaming (avoids Vercel 4.5MB 413 limits)
  const handleSaveToDatabase = async () => {
    if (!matrixResult) return;
    setLoading(true);
    setErrorMessage("");
    setDebugInfo(null);
    setShowDebugDetails(false);

    try {
      const vaultId = `vault_${Date.now()}`;
      const name = parsedWorkbook?.filename || selectedFile?.name || `PAUT_Historical_Dataset_${new Date().toISOString().split("T")[0]}.xlsx`;

      const formattedWeldSpecs: Record<string, { nominalWallThickness: number; cladThickness: number; jointDegrees: number; bevelType?: BevelJointType }> = {};
      availableWeldsForSelectedDrums.forEach((w) => {
        const numSpec = getNumericWeldSpec(w);
        formattedWeldSpecs[w] = {
          nominalWallThickness: numSpec.wallThickness,
          cladThickness: numSpec.cladThickness,
          jointDegrees: numSpec.jointDegrees,
          bevelType: numSpec.bevelType,
        };
      });

      const totalIndications = matrixResult.physicalIndications.length;
      let totalObservationsSaved = 0;

      // Extract distinct weld pairs across all indications
      const distinctWelds: Array<{ drumName: string; weldName: string }> = [];
      const seenWelds = new Set<string>();
      matrixResult.physicalIndications.forEach((pi) => {
        const d = (pi.drumName || matrixResult.availableDrums[0] || "C04").toUpperCase().trim();
        const w = (pi.weldName || "C6").trim();
        const k = `${d}:::${w}`;
        if (!seenWelds.has(k)) {
          seenWelds.add(k);
          distinctWelds.push({ drumName: d, weldName: w });
        }
      });

      // ─────────────────────────────────────────────────────────────
      // STAGE 1: Initialize Database Registry (~3 KB)
      // ─────────────────────────────────────────────────────────────
      setSaveProgressText(`Initializing campaign registry (${matrixResult.availableDrums.length} drums, ${matrixResult.campaigns.length} campaigns)...`);

      const initRes = await fetch("/api/inspections/save-matrix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "init",
          drumId: selectedDrumId || 1,
          filename: name,
          targetClientId: selectedClientId || undefined,
          nominalWallThickness,
          cladThickness,
          jointDegrees,
          availableDrums: matrixResult.availableDrums,
          campaigns: matrixResult.campaigns.map((c) => ({ key: c.key, label: c.label, date: c.date })),
          distinctWelds,
        }),
      });

      const initData = await initRes.json().catch(() => ({}));
      if (!initRes.ok || !initData.success) {
        const errObj = {
          httpStatus: initRes.status,
          httpStatusText: initRes.statusText,
          serverError: initData.error || `Initialization failed: HTTP ${initRes.status}`,
          serverDebug: initData.debug || null,
          activeUser: sessionDiagnostic?.session?.user || null,
        };
        setDebugInfo(errObj);
        throw new Error(initData.error || `Server returned HTTP ${initRes.status} on initialization`);
      }

      const { drumLookup, weldLookup, campaignMap } = initData;

      // ─────────────────────────────────────────────────────────────
      // STAGE 2: Stream Indications in Chunks of 150 (~40-60 KB each)
      // ─────────────────────────────────────────────────────────────
      const CHUNK_SIZE = 150;
      const chunks: Array<typeof matrixResult.physicalIndications> = [];
      for (let i = 0; i < matrixResult.physicalIndications.length; i += CHUNK_SIZE) {
        chunks.push(matrixResult.physicalIndications.slice(i, i + CHUNK_SIZE));
      }

      for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
        const chunk = chunks[cIdx];
        const currentSaved = Math.min(totalIndications, (cIdx + 1) * CHUNK_SIZE);
        const percent = Math.round((currentSaved / totalIndications) * 100);

        setSaveProgressText(`Saving flaw indications: ${currentSaved} of ${totalIndications} (${percent}%) [Batch ${cIdx + 1}/${chunks.length}]...`);

        const chunkRes = await fetch("/api/inspections/save-matrix", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "save-chunk",
            indications: chunk,
            campaigns: matrixResult.campaigns.map((c) => ({ key: c.key, label: c.label, date: c.date })),
            drumLookup,
            weldLookup,
            campaignMap,
            fallbackDrumId: selectedDrumId || 1,
          }),
        });

        const chunkData = await chunkRes.json().catch(() => ({}));
        if (!chunkRes.ok || !chunkData.success) {
          const errObj = {
            httpStatus: chunkRes.status,
            httpStatusText: chunkRes.statusText,
            serverError: chunkData.error || `Batch ${cIdx + 1}/${chunks.length} failed: HTTP ${chunkRes.status}`,
            serverDebug: chunkData.debug || null,
            activeUser: sessionDiagnostic?.session?.user || null,
          };
          setDebugInfo(errObj);
          throw new Error(chunkData.error || `Batch ${cIdx + 1} failed: HTTP ${chunkRes.status}`);
        }

        totalObservationsSaved += chunkData.insertedObservations || 0;
      }

      // ─────────────────────────────────────────────────────────────
      // STAGE 3: Finalize Audit Log Record (~0.5 KB)
      // ─────────────────────────────────────────────────────────────
      setSaveProgressText("Finalizing database records and audit history...");
      await fetch("/api/inspections/save-matrix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "finalize",
          drumId: selectedDrumId || 1,
          filename: name,
          totalIndications,
          totalObservations: totalObservationsSaved,
          campaignsCount: matrixResult.campaigns.length,
        }),
      });

      // ─────────────────────────────────────────────────────────────
      // STAGE 4: Cache in Browser Local Vault
      // ─────────────────────────────────────────────────────────────
      setSaveProgressText("Caching dataset in browser local vault...");
      await saveDatasetToVault({
        id: vaultId,
        name,
        savedAt: new Date().toISOString(),
        availableDrums: matrixResult.availableDrums,
        weldsByDrum: matrixResult.weldsByDrum,
        campaigns: matrixResult.campaigns.map((c) => ({ key: c.key, label: c.label, date: c.date })),
        totalIndications: matrixResult.physicalIndications.length,
        matrixResult,
        activeDrum: selectedDrums[0] !== "ALL" ? selectedDrums[0] : matrixResult.availableDrums[0],
        activeWeld: selectedWelds[0] !== "ALL" ? selectedWelds[0] : undefined,
        repairZones,
        jointAliases,
        nominalWallThickness,
        cladThickness,
        jointDegrees,
        weldSpecs: formattedWeldSpecs,
      });

      await setActiveVaultDatasetId(vaultId);
      await loadVaultDatasets();

      setSavedResult({
        drumsCount: matrixResult.availableDrums.length,
        campaignsCount: matrixResult.campaigns.length,
        physicalIndicationsCount: matrixResult.physicalIndications.length,
        observationsCount: totalObservationsSaved || matrixResult.observations.length,
      });
      setStep("SAVED");
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to save dataset to database");
    } finally {
      setLoading(false);
      setSaveProgressText("");
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Coke Drum PAUT Historical Inspection Platform</h2>
          <p className="text-sm text-slate-500">Upload Excel, select Coke Drum(s) & Weld Joint(s), and explore interactive 2D circumferential defect visualization</p>
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

      {/* Top Diagnostic Status Pill */}
      {sessionDiagnostic && (
        <div className="flex flex-wrap items-center justify-between text-xs px-4 py-2 rounded-xl bg-slate-100/90 border border-slate-200 text-slate-600 gap-2">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 font-medium">
              <span className={`w-2 h-2 rounded-full ${sessionDiagnostic.database?.status === "connected" ? "bg-emerald-500" : "bg-red-500"}`} />
              <span>DB: {sessionDiagnostic.database?.status === "connected" ? "Connected (Neon)" : "Disconnected"}</span>
            </span>
            <span className="text-slate-300">|</span>
            <span>
              User: <strong className="text-slate-800">{sessionDiagnostic.session?.user?.email || "Guest"}</strong>
            </span>
            <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] uppercase tracking-wider ${sessionDiagnostic.session?.user?.role === "MASTER" ? "bg-emerald-100 text-emerald-800 border border-emerald-200" : "bg-amber-100 text-amber-800 border border-amber-200"}`}>
              {sessionDiagnostic.session?.user?.role || "CLIENT"}
            </span>
          </div>

          <button
            type="button"
            onClick={runDiagnosticCheck}
            disabled={diagnosticLoading}
            className="flex items-center gap-1 text-[11px] font-semibold text-sky-700 hover:text-sky-900 cursor-pointer"
            title="Refresh Diagnostic Session Status"
          >
            <RefreshCw size={11} className={diagnosticLoading ? "animate-spin" : ""} />
            <span>{diagnosticLoading ? "Checking..." : "Re-check Status"}</span>
          </button>
        </div>
      )}

      {/* Role Warning Banner if user is CLIENT */}
      {sessionDiagnostic?.session?.user?.role === "CLIENT" && (
        <div className="p-4 rounded-xl border border-amber-300 bg-amber-50/90 text-amber-900 flex items-start space-x-3 text-sm shadow-2xs">
          <ShieldAlert className="shrink-0 text-amber-600 mt-0.5" size={20} />
          <div className="space-y-1">
            <p className="font-bold">Refinery Client Account Detected ({sessionDiagnostic.session.user.email})</p>
            <p className="text-xs text-amber-800 leading-relaxed">
              You are signed in with a <strong>CLIENT</strong> role. Client accounts have read-only inspection review privileges for their assigned Coke Drums. 
              Uploading and saving datasets into the master platform database requires a <strong>MASTER</strong> engineer account (e.g. <code>master@demo.com</code>).
            </p>
          </div>
        </div>
      )}

      {/* Save In-Progress Live Status */}
      {loading && saveProgressText && (
        <div className="p-3.5 rounded-xl border border-sky-200 bg-sky-50 text-sky-800 flex items-center space-x-3 text-xs font-semibold shadow-2xs animate-pulse">
          <Loader2 className="shrink-0 animate-spin text-sky-600" size={18} />
          <span>{saveProgressText}</span>
        </div>
      )}

      {/* Error Banner with Expandable Diagnostic Drawer */}
      {errorMessage && (
        <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-800 space-y-3 text-sm shadow-xs">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center space-x-3">
              <AlertTriangle className="shrink-0 text-red-600" size={20} />
              <div>
                <p className="font-bold text-red-900">{errorMessage}</p>
                <p className="text-xs text-red-700 mt-0.5">
                  {debugInfo?.serverDebug?.authHint || "Please review the diagnostic report below or verify your login credentials."}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowDebugDetails(!showDebugDetails)}
                className="text-xs font-semibold px-2.5 py-1 rounded-md border border-red-300 bg-white text-red-800 hover:bg-red-100 flex items-center gap-1 transition cursor-pointer"
              >
                <span>{showDebugDetails ? "Hide Debug" : "Diagnostic Report"}</span>
                {showDebugDetails ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
            </div>
          </div>

          {showDebugDetails && (
            <div className="mt-3 p-3.5 bg-white rounded-lg border border-red-200 text-xs font-mono space-y-2.5 text-slate-800">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="font-bold text-slate-700 flex items-center gap-1 font-sans">
                  <Info size={14} className="text-sky-600" /> System Diagnostic Report
                </span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify({ errorMessage, debugInfo, sessionDiagnostic }, null, 2));
                    setCopiedDebug(true);
                    setTimeout(() => setCopiedDebug(false), 2000);
                  }}
                  className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center gap-1 text-[11px] font-sans transition cursor-pointer"
                >
                  {copiedDebug ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                  <span>{copiedDebug ? "Copied!" : "Copy Report"}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                <div><strong className="text-slate-500">Active User:</strong> {sessionDiagnostic?.session?.user?.email || "None detected"}</div>
                <div>
                  <strong className="text-slate-500">Active Role:</strong>{" "}
                  <span className={`px-1.5 py-0.5 rounded font-bold ${sessionDiagnostic?.session?.user?.role === "MASTER" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                    {sessionDiagnostic?.session?.user?.role || "GUEST"}
                  </span>
                </div>
                <div><strong className="text-slate-500">DB Status:</strong> <span className={sessionDiagnostic?.database?.status === "connected" ? "text-emerald-600 font-bold" : "text-red-600 font-bold"}>{sessionDiagnostic?.database?.status || "Unknown"}</span></div>
                <div><strong className="text-slate-500">Vercel Host:</strong> {sessionDiagnostic?.network?.host || "Vercel Cloud"}</div>
                {debugInfo?.httpStatus && <div><strong className="text-slate-500">HTTP Status:</strong> <span className="font-bold text-red-600">{debugInfo.httpStatus} {debugInfo.httpStatusText}</span></div>}
                {debugInfo?.payloadSizeKb && <div><strong className="text-slate-500">Payload Size:</strong> {debugInfo.payloadSizeKb} KB</div>}
              </div>

              {debugInfo?.serverDebug && (
                <div className="pt-2 border-t border-slate-100">
                  <strong className="text-slate-500 font-sans">Server Diagnostic Details:</strong>
                  <pre className="p-2 mt-1 bg-slate-50 rounded border border-slate-200 overflow-x-auto text-[10px] text-slate-700">
                    {JSON.stringify(debugInfo.serverDebug, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
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

          {/* Target Client Organization Selector */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Building size={14} className="text-sky-600" />
                <span>Target Client Organization *</span>
              </label>
              <p className="text-[11px] text-slate-500">Select which refinery client organization this inspection matrix belongs to</p>
            </div>
            <select
              value={selectedClientId || ""}
              onChange={(e) => setSelectedClientId(Number(e.target.value))}
              className="border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 bg-white focus:ring-2 focus:ring-sky-500 focus:outline-none min-w-[240px]"
            >
              {clientsList.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
              {clientsList.length === 0 && <option value="">No registered clients (auto-create default)</option>}
            </select>
          </div>

          <div className="border-2 border-dashed border-sky-200 rounded-xl p-8 text-center bg-sky-50/30 space-y-4">
            <div className="w-12 h-12 rounded-full bg-sky-100 text-sky-600 mx-auto flex items-center justify-center">
              <FileSpreadsheet size={24} />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700">Choose your PAUT inspection workbook (.xlsx, .xls, .csv)</p>
              <p className="text-xs text-slate-400 mt-1">The system will automatically detect coke drums, weld joints, and historical campaigns</p>
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
              className="flex items-center space-x-2 bg-sky-600 hover:bg-sky-700 text-white px-6 py-2.5 rounded-lg text-sm font-bold transition-colors disabled:opacity-50 cursor-pointer"
            >
              <span>{loading ? "Processing Workbook..." : "Inspect & Select Preferences"}</span>
              <ArrowRight size={16} />
            </button>
          </div>

          {/* Saved Datasets in Local Vault */}
          {vaultDatasets.length > 0 && (
            <div className="border-t border-slate-100 pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Database size={16} className="text-emerald-600" />
                    <span>Saved Datasets in Local Vault ({vaultDatasets.length})</span>
                  </h4>
                  <p className="text-xs text-slate-500">
                    Locally cached datasets stored in browser IndexedDB. Fast offline retrieval with WebWorker processing.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {vaultDatasets.map((ds) => (
                  <div
                    key={ds.id}
                    onClick={() => handleLoadVaultDataset(ds.id)}
                    className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-sky-50/50 hover:border-sky-300 transition cursor-pointer flex items-center justify-between group"
                  >
                    <div className="space-y-1 pr-3 min-w-0">
                      <p className="text-xs font-bold text-slate-900 truncate group-hover:text-sky-700">{ds.name}</p>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                        <span className="font-semibold text-slate-700">{ds.availableDrums.length} Drums</span>
                        <span>•</span>
                        <span className="font-semibold text-emerald-700">{ds.totalIndications} Indications</span>
                        <span>•</span>
                        <span>{new Date(ds.savedAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={(e) => handleDeleteVaultDataset(ds.id, e)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                        title="Delete from Vault"
                      >
                        <Trash2 size={14} />
                      </button>
                      <button
                        className="px-3 py-1 text-xs font-bold bg-sky-600 group-hover:bg-sky-700 text-white rounded-lg shadow-xs transition cursor-pointer"
                      >
                        Open
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 2: COKE DRUM & WELD PREFERENCES CENTER */}
      {step === "PREFERENCES" && matrixResult && (
        <div className="bg-white rounded-xl border border-slate-200 p-7 shadow-sm space-y-7">
          <div className="border-b border-slate-100 pb-4">
            <span className="text-xs font-bold px-2.5 py-1 bg-sky-100 text-sky-800 rounded-full uppercase tracking-wider">
              Step 2 of 3
            </span>
            <h3 className="text-xl font-bold text-slate-900 mt-2">Which Coke Drum & Weld Joint do you want to analyze?</h3>
            <p className="text-xs text-slate-500 mt-1">
              Detected <strong>{matrixResult.availableDrums.length} Coke Drums</strong> and <strong>{matrixResult.availableWelds.length} Weld Joints</strong> across <strong>{matrixResult.campaigns.length} Inspection Campaigns</strong>.
            </p>
          </div>

          {/* 0. Target Client Selector */}
          <div className="space-y-2 bg-sky-50/60 border border-sky-200 p-4 rounded-xl">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-sky-900 flex items-center gap-1.5">
                <Building size={14} className="text-sky-700" />
                <span>Assign Inspection Dataset to Target Client Organization *</span>
              </label>
              <Link href="/clients" className="text-[11px] font-bold text-sky-700 hover:underline">
                + Manage Clients
              </Link>
            </div>
            <select
              value={selectedClientId || ""}
              onChange={(e) => setSelectedClientId(Number(e.target.value))}
              className="w-full border border-sky-300 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 bg-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
            >
              {clientsList.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name} {client.description ? `(${client.description})` : ""}
                </option>
              ))}
              {clientsList.length === 0 && <option value="">No clients registered (auto-creates default facility)</option>}
            </select>
          </div>

          {/* 1. Coke Drum Selector */}
          <div className="space-y-3">
            <label className="block text-sm font-bold text-slate-800">
              1. Select Coke Drum(s):
            </label>
            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={() => handleToggleDrum("ALL")}
                className={`px-4 py-2 rounded-lg text-xs font-bold border transition-all ${selectedDrums.includes("ALL") ? "bg-sky-600 text-white border-sky-600 shadow-sm" : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"}`}
              >
                All Coke Drums ({matrixResult.availableDrums.length})
              </button>
              {matrixResult.availableDrums.map((drum) => {
                const isSelected = selectedDrums.includes(drum);
                return (
                  <button
                    key={drum}
                    type="button"
                    onClick={() => handleToggleDrum(drum)}
                    className={`px-4 py-2 rounded-lg text-xs font-semibold border transition-all ${isSelected ? "bg-sky-600 text-white border-sky-600 shadow-sm" : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"}`}
                  >
                    Coke Drum {drum}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Weld / Joint Selector */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-bold text-slate-800">
                2. Select Weld Joint(s):
              </label>
              <button
                type="button"
                onClick={() => setShowRenameModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 transition-colors cursor-pointer"
                title="Customize or rename weld joint labels (e.g. C1, C2, C9)"
              >
                <Pencil size={13} />
                <span>Customize Joint Names</span>
              </button>
            </div>
            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={() => handleToggleWeld("ALL")}
                className={`px-4 py-2 rounded-lg text-xs font-bold border transition-all ${selectedWelds.includes("ALL") ? "bg-indigo-600 text-white border-indigo-600 shadow-sm" : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"}`}
              >
                All Welds ({availableWeldsForSelectedDrums.length})
              </button>
              {availableWeldsForSelectedDrums.map((weld) => {
                const isSelected = selectedWelds.includes(weld);
                const displayName = getJointDisplayName(weld);
                return (
                  <button
                    key={weld}
                    type="button"
                    onClick={() => handleToggleWeld(weld)}
                    className={`px-4 py-2 rounded-lg text-xs font-semibold border transition-all flex items-center gap-1.5 ${isSelected ? "bg-indigo-600 text-white border-indigo-600 shadow-sm" : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"}`}
                  >
                    <span>{displayName}</span>
                    {jointAliases[weld] && (
                      <span className="text-[10px] opacity-75 font-mono">({weld})</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Drum & Weld Joint Geometry Specifications */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
              <div>
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Sliders size={16} className="text-sky-600" />
                  <span>3. Drum &amp; Weld Joint Specifications</span>
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Configure nominal wall thickness, cladding, and total groove angle individually for each weld joint below, or apply master parameters in bulk across all welds.
                </p>
              </div>
              <span className="self-start sm:self-center text-[10px] font-bold px-2.5 py-1 rounded-full bg-sky-100 text-sky-800 border border-sky-200 uppercase tracking-wider">
                Per-Weld Configurable
              </span>
            </div>

            {/* Master Batch Settings Bar */}
            <div className="bg-white border border-sky-200 rounded-xl p-4 shadow-xs space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles size={15} className="text-sky-600" />
                  <span className="text-xs font-bold text-slate-800">Master Batch Settings (Apply to All Welds):</span>
                  <span className="text-[11px] text-slate-400 hidden md:inline">Quickly sync parameters across all {availableWeldsForSelectedDrums.length} welds</span>
                </div>
                <button
                  type="button"
                  onClick={handleApplyMasterToAllWelds}
                  className="px-3.5 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-bold shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Click to apply these master thickness and angle values to every weld listed below"
                >
                  <CheckCircle2 size={13} />
                  <span>Apply to All Welds ({availableWeldsForSelectedDrums.length})</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                {/* Master Wall */}
                <div className="bg-sky-50/50 border border-sky-100 rounded-lg p-2.5 space-y-1">
                  <label className="block text-[11px] font-bold text-slate-700">
                    Master Wall Thickness (mm)
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type="number"
                      step="0.5"
                      min="1"
                      max="200"
                      value={masterWallThickness}
                      onChange={(e) => setMasterWallThickness(e.target.value)}
                      className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs font-bold text-slate-900 bg-white focus:ring-2 focus:ring-sky-500 focus:outline-none pr-7 text-right"
                    />
                    <span className="absolute right-2 text-[11px] text-slate-400 font-bold pointer-events-none">mm</span>
                  </div>
                  <p className="text-[10px] text-slate-400">Default: 32.0 mm</p>
                </div>

                {/* Master Clad */}
                <div className="bg-sky-50/50 border border-sky-100 rounded-lg p-2.5 space-y-1">
                  <label className="block text-[11px] font-bold text-slate-700">
                    Master Cladding Thickness (mm)
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="30"
                      value={masterCladThickness}
                      onChange={(e) => setMasterCladThickness(e.target.value)}
                      className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs font-bold text-slate-900 bg-white focus:ring-2 focus:ring-sky-500 focus:outline-none pr-7 text-right"
                    />
                    <span className="absolute right-2 text-[11px] text-slate-400 font-bold pointer-events-none">mm</span>
                  </div>
                  <p className="text-[10px] text-slate-400">Internal clad (Default: 3.0 mm)</p>
                </div>

                {/* Master Degrees */}
                <div className="bg-sky-50/50 border border-sky-100 rounded-lg p-2.5 space-y-1">
                  <label className="block text-[11px] font-bold text-slate-700">
                    Master Joint Degrees (Groove Angle °)
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type="number"
                      step="1"
                      min="10"
                      max="120"
                      value={masterJointDegrees}
                      onChange={(e) => setMasterJointDegrees(e.target.value)}
                      className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs font-bold text-slate-900 bg-white focus:ring-2 focus:ring-sky-500 focus:outline-none pr-6 text-right"
                    />
                    <span className="absolute right-2 text-[11px] text-slate-400 font-bold pointer-events-none">°</span>
                  </div>
                  <p className="text-[10px] text-slate-400">Total groove angle (Default: 60°)</p>
                </div>
              </div>
            </div>

            {/* Vertical Stack: All Welds Opened One by One Vertically with Bevel Profile Dropdown */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1">
                <div>
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                    Individual Weld Seam &amp; Bevel Profile Data ({availableWeldsForSelectedDrums.length} Welds):
                  </span>
                  <p className="text-[11px] text-slate-500">
                    Assign authentic fabrication bevel shapes (Rows D–G) and engineering dimensions to each weld joint
                  </p>
                </div>

                {/* Batch Bevel Actions */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg">
                    <span className="text-[11px] font-bold text-slate-600 pl-1">Batch Bevel:</span>
                    <select
                      onChange={(e) => {
                        if (e.target.value) handleBatchApplyBevelType(e.target.value as BevelJointType);
                      }}
                      defaultValue=""
                      className="bg-white border border-slate-300 rounded px-2 py-0.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-sky-500 cursor-pointer"
                    >
                      <option value="" disabled>Apply bevel to all...</option>
                      {ALL_BEVEL_TYPES.map((bt) => {
                        const def = BEVEL_DEFINITIONS[bt];
                        return (
                          <option key={bt} value={bt}>
                            {def.shortName}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={handleAutoDetectAllBevels}
                    className="px-2.5 py-1 text-xs font-bold text-sky-700 bg-sky-50 border border-sky-200 hover:bg-sky-100 rounded-lg transition cursor-pointer"
                    title="Auto-detect bevel types from weld seam names (C8 -> 1:10 Taper, L1~7 -> GTAW, SL -> Skirt, H1/2 -> Head)"
                  >
                    ⚡ Auto-Detect All
                  </button>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl bg-white overflow-hidden shadow-2xs divide-y divide-slate-100">
                {/* Table Header Row */}
                <div className="bg-slate-100/80 px-4 py-2.5 flex items-center justify-between text-[11px] font-bold text-slate-700 uppercase tracking-wider gap-3">
                  <div className="w-36 shrink-0">Weld Seam</div>
                  <div className="flex-1 min-w-[220px]">Bevel Shape Profile (Drawing D–G)</div>
                  <div className="w-24 shrink-0 text-center">Wall (mm)</div>
                  <div className="w-24 shrink-0 text-center">Clad (mm)</div>
                  <div className="w-24 shrink-0 text-center">Groove (°)</div>
                  <div className="w-16 text-right shrink-0">Action</div>
                </div>

                {/* Vertical Rows: One by One */}
                {availableWeldsForSelectedDrums.map((weld) => {
                  const autoBevel = detectBevelTypeFromWeldName(weld);
                  const spec = weldSpecs[weld] || {
                    wallThickness: masterWallThickness,
                    cladThickness: masterCladThickness,
                    jointDegrees: masterJointDegrees,
                    bevelType: autoBevel,
                  };
                  const currentBevelType = spec.bevelType || autoBevel;
                  const currentBevelDef = getBevelDefinition(currentBevelType);

                  const flawCount = (matrixResult?.physicalIndications || []).filter(
                    (pi) => (selectedDrums.includes("ALL") || selectedDrums.includes(pi.drumName)) && pi.weldName === weld
                  ).length;
                  const isModified =
                    spec.wallThickness !== masterWallThickness ||
                    spec.cladThickness !== masterCladThickness ||
                    spec.jointDegrees !== masterJointDegrees ||
                    spec.bevelType !== autoBevel;

                  return (
                    <div
                      key={weld}
                      className="px-4 py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3 hover:bg-slate-50/80 transition-colors"
                    >
                      {/* Weld Identification */}
                      <div className="w-36 shrink-0 flex items-center gap-2">
                        <span className="font-mono font-bold text-xs bg-indigo-50 text-indigo-800 border border-indigo-200 px-2.5 py-1 rounded-md">
                          {getJointDisplayName(weld)}
                        </span>
                        {jointAliases[weld] && (
                          <span className="text-[10px] font-mono text-slate-400">({weld})</span>
                        )}
                        <span className="text-[10px] text-slate-400 font-medium">
                          {flawCount} {flawCount === 1 ? "flaw" : "flaws"}
                        </span>
                      </div>

                      {/* Bevel Shape Profile Dropdown */}
                      <div className="flex-1 min-w-[220px]">
                        <select
                          value={currentBevelType}
                          onChange={(e) => handleUpdateWeldBevelType(weld, e.target.value as BevelJointType)}
                          className="w-full border border-slate-300 rounded px-2 py-1 text-xs font-bold text-slate-900 bg-white focus:ring-2 focus:ring-sky-500 focus:outline-none cursor-pointer"
                        >
                          {ALL_BEVEL_TYPES.map((bt) => {
                            const def = BEVEL_DEFINITIONS[bt];
                            return (
                              <option key={bt} value={bt}>
                                [{def.drawingRow}] {def.shortName}
                              </option>
                            );
                          })}
                        </select>
                        <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-slate-500">
                          <span className="font-medium text-sky-700">{currentBevelDef.drawingRef}</span>
                          {currentBevelDef.hasTaper && (
                            <span className="px-1 py-0.2 bg-amber-50 text-amber-800 border border-amber-200 rounded font-semibold">1:10 Taper</span>
                          )}
                          {currentBevelDef.gtawRootPass && (
                            <span className="px-1 py-0.2 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded font-semibold">GTAW</span>
                          )}
                          {!currentBevelDef.hasCladding && (
                            <span className="px-1 py-0.2 bg-slate-100 text-slate-700 border border-slate-200 rounded font-semibold">Unclad</span>
                          )}
                          {currentBevelDef.isDoubleV && (
                            <span className="px-1 py-0.2 bg-purple-50 text-purple-800 border border-purple-200 rounded font-semibold">Double-V</span>
                          )}
                        </div>
                      </div>

                      {/* Wall Thickness */}
                      <div className="w-24 shrink-0 relative flex items-center">
                        <input
                          type="number"
                          step="0.5"
                          min="1"
                          max="200"
                          value={spec.wallThickness}
                          onChange={(e) => handleUpdateWeldSpec(weld, "wallThickness", e.target.value)}
                          className="w-full border border-slate-300 rounded px-2 py-1 text-xs font-bold text-slate-900 bg-white focus:ring-2 focus:ring-sky-500 focus:outline-none pr-6 text-right"
                        />
                        <span className="absolute right-1.5 text-[10px] text-slate-400 font-semibold pointer-events-none">mm</span>
                      </div>

                      {/* Clad Thickness */}
                      <div className="w-24 shrink-0 relative flex items-center">
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          max="30"
                          value={spec.cladThickness}
                          onChange={(e) => handleUpdateWeldSpec(weld, "cladThickness", e.target.value)}
                          disabled={!currentBevelDef.hasCladding}
                          className={`w-full border rounded px-2 py-1 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-sky-500 focus:outline-none pr-6 text-right ${
                            !currentBevelDef.hasCladding ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed" : "bg-white border-slate-300"
                          }`}
                        />
                        <span className="absolute right-1.5 text-[10px] text-slate-400 font-semibold pointer-events-none">mm</span>
                      </div>

                      {/* Joint Degrees */}
                      <div className="w-24 shrink-0 relative flex items-center">
                        <input
                          type="number"
                          step="1"
                          min="10"
                          max="120"
                          value={spec.jointDegrees}
                          onChange={(e) => handleUpdateWeldSpec(weld, "jointDegrees", e.target.value)}
                          className="w-full border border-slate-300 rounded px-2 py-1 text-xs font-bold text-slate-900 bg-white focus:ring-2 focus:ring-sky-500 focus:outline-none pr-5 text-right"
                        />
                        <span className="absolute right-1.5 text-[10px] text-slate-400 font-semibold pointer-events-none">°</span>
                      </div>

                      {/* Reset to Auto / Master Action */}
                      <div className="w-16 text-right shrink-0">
                        {isModified ? (
                          <button
                            type="button"
                            onClick={() => handleResetWeldToMaster(weld)}
                            className="text-[11px] font-bold text-amber-600 hover:text-amber-800 hover:underline cursor-pointer"
                            title="Reset this weld to auto-detected bevel defaults"
                          >
                            Reset
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-medium">Auto</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Selection Summary Pill */}
          <div className="p-4 bg-sky-50/70 border border-sky-200 rounded-xl flex items-center justify-between text-xs">
            <div className="space-y-1">
              <p className="text-sky-900 font-bold">Current Target Scope:</p>
              <p className="text-sky-800">
                Coke Drums: <strong>{selectedDrums.includes("ALL") ? "All Coke Drums" : selectedDrums.map(d => `Coke Drum ${d}`).join(", ")}</strong> | Weld Joints: <strong>{selectedWelds.includes("ALL") ? "All Welds" : selectedWelds.map(w => getJointDisplayName(w)).join(", ")}</strong>
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
          {/* Row 1: Command & Scope Bar */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
            {/* Left: Scope filters */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Target Client Org selector */}
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
                <span className="text-xs font-bold text-slate-600 flex items-center gap-1">
                  <Building size={12} className="text-sky-600" />
                  <span>Client Org:</span>
                </span>
                <select
                  value={selectedClientId || ""}
                  onChange={(e) => setSelectedClientId(Number(e.target.value))}
                  className="border border-slate-300 rounded px-2 py-0.5 text-xs font-bold text-sky-800 bg-white focus:ring-1 focus:ring-sky-500 focus:outline-none"
                >
                  {clientsList.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                  {clientsList.length === 0 && <option value="">No Client Selected</option>}
                </select>
              </div>

              {/* Coke Drum selector */}
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
                <span className="text-xs font-bold text-slate-600">Coke Drum:</span>
                <select
                  value={selectedDrums[0] || "ALL"}
                  onChange={(e) => setSelectedDrums([e.target.value])}
                  className="border border-slate-300 rounded px-2 py-0.5 text-xs font-bold text-sky-800 bg-white focus:ring-1 focus:ring-sky-500 focus:outline-none"
                >
                  <option value="ALL">All Coke Drums</option>
                  {matrixResult.availableDrums.map(d => (
                    <option key={d} value={d}>Coke Drum {d}</option>
                  ))}
                </select>
              </div>

              {/* Weld Joint selector + Rename Pencil */}
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
                <span className="text-xs font-bold text-slate-600">Weld Joint:</span>
                <select
                  value={selectedWelds[0] || "ALL"}
                  onChange={(e) => setSelectedWelds([e.target.value])}
                  className="border border-slate-300 rounded px-2 py-0.5 text-xs font-bold text-indigo-800 bg-white max-w-[190px] truncate focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="ALL">All Welds</option>
                  {availableWeldsForSelectedDrums.map(w => (
                    <option key={w} value={w}>{getJointDisplayName(w)}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowRenameModal(true)}
                  className="p-1 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded transition-colors cursor-pointer"
                  title="Customize or rename weld joint labels (e.g. C1, C2, C9)"
                >
                  <Pencil size={13} />
                </button>
              </div>

              {/* Campaign scrubber */}
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
                <span className="text-xs font-bold text-slate-600">Campaign Timeline:</span>
                <select
                  value={selectedCampaign}
                  onChange={(e) => setSelectedCampaign(e.target.value)}
                  className="border border-slate-300 rounded px-2 py-0.5 text-xs font-semibold text-slate-700 bg-white focus:ring-1 focus:ring-sky-500 focus:outline-none"
                >
                  <option value="ALL">All Campaigns (Latest)</option>
                  {matrixResult.campaigns.map(c => (
                    <option key={c.key} value={c.key}>{c.label}</option>
                  ))}
                </select>
              </div>

              {/* Drum & Weld Specs Quick Tuner */}
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-xs">
                <span className="font-bold text-slate-600 flex items-center gap-1">
                  <Sliders size={12} className="text-sky-600" />
                  <span>{effectiveWeldKey ? getJointDisplayName(effectiveWeldKey) : "Weld"} Specs:</span>
                </span>
                <span className="font-mono text-[11px] text-slate-700 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                  Wall: <strong>{activeSpec.wallThickness}mm</strong>
                </span>
                <span className="font-mono text-[11px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                  Clad: <strong>{activeSpec.cladThickness}mm</strong>
                </span>
                <span className="font-mono text-[11px] text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                  Groove: <strong>{activeSpec.jointDegrees}°</strong>
                </span>
                <button
                  type="button"
                  onClick={openSpecsModal}
                  className="p-1 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded transition-colors cursor-pointer"
                  title="Tune drum wall thickness, clad thickness, and joint degrees"
                >
                  <Pencil size={12} />
                </button>
              </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2.5 ml-auto">
              <Link
                href="/prediction"
                className="flex items-center space-x-1.5 bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 px-3.5 py-2 rounded-lg text-xs font-bold transition-colors shadow-xs"
              >
                <TrendingUp size={14} />
                <span>Full Predictive Platform</span>
              </Link>
              <button
                type="button"
                onClick={handleSaveToDatabase}
                disabled={loading}
                className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-xs transition-colors cursor-pointer"
              >
                <Database size={14} />
                <span>{loading ? "Saving..." : "Save Dataset to Platform"}</span>
              </button>
            </div>
          </div>

          {/* Row 2: Visualizer Navigation & Layout Switcher & Quick Flaw */}
          <div className="bg-white rounded-xl border border-slate-200 p-2.5 shadow-xs flex flex-wrap items-center justify-between gap-3">
            {/* Visualizer Mode Tabs */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setVisualizerTab("POLAR_RING")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  visualizerTab === "POLAR_RING"
                    ? "bg-sky-600 text-white shadow-xs"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                <CircleDot size={14} />
                <span>360° Circular Ring</span>
              </button>

              <button
                type="button"
                onClick={() => setVisualizerTab("WELD_WIDTH")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  visualizerTab === "WELD_WIDTH"
                    ? "bg-sky-600 text-white shadow-xs"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                <Maximize2 size={14} />
                <span>Weld Width Plan</span>
              </button>

              <button
                type="button"
                onClick={() => setVisualizerTab("BEVEL_SLICE")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  visualizerTab === "BEVEL_SLICE"
                    ? "bg-sky-600 text-white shadow-xs"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                <Crosshair size={14} />
                <span>Bevel S-Scan Profile</span>
              </button>

              <button
                type="button"
                onClick={() => setVisualizerTab("GROWTH_CURVE")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  visualizerTab === "GROWTH_CURVE"
                    ? "bg-sky-600 text-white shadow-xs"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                <TrendingUp size={14} />
                <span>Growth &amp; Forecast</span>
              </button>

              <button
                type="button"
                onClick={() => setVisualizerTab("UNROLLED_RIBBON")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  visualizerTab === "UNROLLED_RIBBON"
                    ? "bg-sky-600 text-white shadow-xs"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                <Layers size={14} />
                <span>Unrolled 2D Ribbon</span>
              </button>
            </div>

            {/* Layout Switcher & Repair & Quick Flaw Selector */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Layout Mode Segmented Control */}
              <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                <button
                  type="button"
                  onClick={() => setLayoutMode("SPLIT")}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition ${
                    layoutMode === "SPLIT"
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                  title="Side-by-side visualizer + defect table"
                >
                  Split View
                </button>
                <button
                  type="button"
                  onClick={() => setLayoutMode("CANVAS_ONLY")}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition ${
                    layoutMode === "CANVAS_ONLY"
                      ? "bg-white text-sky-700 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                  title="Full-width expanded map (spacious view)"
                >
                  Expanded Map
                </button>
                <button
                  type="button"
                  onClick={() => setLayoutMode("TABLE_ONLY")}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition ${
                    layoutMode === "TABLE_ONLY"
                      ? "bg-white text-indigo-700 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                  title="Focus on historical defect register table"
                >
                  Table Only
                </button>
              </div>

              {/* Repair Zones Button */}
              <button
                type="button"
                onClick={() => setShowRepairModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100 cursor-pointer"
                title="Manage partial weld replacements and review disappeared flaw anomalies"
              >
                <Wrench size={14} className="text-emerald-700" />
                <span>Repairs ({repairZones.length})</span>
                {anomalies.length > 0 && (
                  <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-extrabold bg-amber-500 text-white animate-pulse">
                    {anomalies.length} anomaly
                  </span>
                )}
              </button>

              {/* Quick Flaw Selector */}
              {activeFlaw && (
                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg">
                  <span className="text-[11px] text-slate-500 font-medium">Flaw:</span>
                  <select
                    value={activeFlaw.code}
                    onChange={(e) => {
                      const found = filteredIndications.find(i => i.code === e.target.value);
                      if (found) setSelectedFlawForForecast(found);
                    }}
                    className="border border-slate-300 rounded px-1.5 py-0.5 text-xs font-bold text-sky-800 bg-white max-w-[170px] truncate focus:ring-1 focus:ring-sky-500"
                  >
                    {filteredIndications.map(pi => (
                      <option key={pi.code} value={pi.code}>
                        {pi.code} ({getJointDisplayName(pi.weldName)} @ {pi.locationText})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Active Visualization Display (Hidden if TABLE_ONLY) */}
          {layoutMode !== "TABLE_ONLY" && (
            <div>
              {visualizerTab === "POLAR_RING" && (
                <PolarCircumferentialRingMap
                  indications={filteredIndications}
                  selectedFlawCode={activeFlaw?.code}
                  onSelectFlaw={(pi) => setSelectedFlawForForecast(pi)}
                  drumName={selectedDrums.includes("ALL") ? "All Coke Drums" : selectedDrums.map(d => `Coke Drum ${d}`).join(", ")}
                  weldName={selectedWelds.includes("ALL") ? "All Welds" : selectedWelds.map(w => getJointDisplayName(w)).join(", ")}
                  nominalWallThickness={activeSpec.wallThickness}
                  cladThickness={activeSpec.cladThickness}
                  jointDegrees={activeSpec.jointDegrees}
                  repairZones={repairZones}
                  layoutMode={layoutMode}
                />
              )}

              {visualizerTab === "WELD_WIDTH" && (
                <WeldWidthPlanPlot
                  indications={filteredIndications}
                  selectedFlawCode={activeFlaw?.code}
                  onSelectFlaw={(pi) => setSelectedFlawForForecast(pi)}
                  repairZones={repairZones}
                  nominalWallThickness={activeSpec.wallThickness}
                  cladThickness={activeSpec.cladThickness}
                  jointDegrees={activeSpec.jointDegrees}
                  bevelType={activeSpec.bevelType}
                />
              )}

              {visualizerTab === "BEVEL_SLICE" && activeFlaw && (
                <WeldBevelSScanProfile
                  indication={activeFlaw}
                  nominalWallThickness={activeSpec.wallThickness}
                  cladThickness={activeSpec.cladThickness}
                  jointDegrees={activeSpec.jointDegrees}
                  bevelType={activeSpec.bevelType}
                />
              )}

              {visualizerTab === "GROWTH_CURVE" && activeFlaw && (
                <PredictiveForecastChart
                  measurements={getMeasurementsForFlaw(activeFlaw)}
                  flawCode={activeFlaw.code}
                  locationInfo={`${activeFlaw.drumName} — ${getJointDisplayName(activeFlaw.weldName)} @ ${activeFlaw.locationText}`}
                  nominalThickness={activeSpec.wallThickness}
                />
              )}

              {visualizerTab === "UNROLLED_RIBBON" && (
                <WeldCircumferentialMap
                  indications={filteredIndications}
                  selectedCampaign={selectedCampaign}
                  campaigns={matrixResult.campaigns}
                  activeDrumName={selectedDrums.includes("ALL") ? "All Coke Drums" : selectedDrums.map(d => `Coke Drum ${d}`).join(", ")}
                  activeWeldName={selectedWelds.includes("ALL") ? "All Welds" : selectedWelds.map(w => getJointDisplayName(w)).join(", ")}
                  onSelectIndication={(pi) => setSelectedFlawForForecast(pi)}
                  selectedIndicationCode={activeFlaw?.code}
                />
              )}
            </div>
          )}

          {/* Detailed Historical Inspection Observations Matrix Table (Hidden if CANVAS_ONLY) */}
          {layoutMode !== "CANVAS_ONLY" && (
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
                      <th className="p-3">Coke Drum</th>
                      <th className="p-3">Joint</th>
                      <th className="p-3">Segment</th>
                      <th className="p-3">Defect Location</th>
                      {matrixResult.campaigns.map(c => (
                        <th key={c.key} className="p-3 whitespace-nowrap">{c.key} (mm)</th>
                      ))}
                      <th className="p-3 whitespace-nowrap">Growth Delta</th>
                      <th className="p-3 whitespace-nowrap">Annual Rate</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-center">Forecast</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredIndications.map((pi) => (
                      <tr
                        key={pi.code}
                        onClick={() => setSelectedFlawForForecast(pi)}
                        className={`border-b border-slate-100 hover:bg-sky-50/60 transition-colors cursor-pointer ${
                          activeFlaw?.code === pi.code ? "bg-sky-50 font-medium" : ""
                        }`}
                      >
                        <td className="p-3 font-bold text-sky-700">{pi.code}</td>
                        <td className="p-3 font-semibold text-slate-800">{pi.drumName}</td>
                        <td className="p-3 font-medium text-slate-700">
                          <span>{getJointDisplayName(pi.weldName)}</span>
                          {jointAliases[pi.weldName] && (
                            <span className="ml-1 text-[10px] text-slate-400 font-mono">({pi.weldName})</span>
                          )}
                        </td>
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
                        <td className="p-3 text-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedFlawForForecast(pi);
                            }}
                            className={`px-2.5 py-1 rounded text-[11px] font-bold transition ${
                              activeFlaw?.code === pi.code
                                ? "bg-sky-600 text-white shadow-xs"
                                : "bg-slate-100 text-slate-700 hover:bg-sky-100 hover:text-sky-800"
                            }`}
                          >
                            {activeFlaw?.code === pi.code ? "Active" : "Inspect"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
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
              Persisted <strong>{savedResult.drumsCount || 9}</strong> Coke Drums, <strong>{savedResult.campaignsCount}</strong> campaigns, <strong>{savedResult.physicalIndicationsCount}</strong> physical indications, and <strong>{savedResult.observationsCount}</strong> measurements into your database.
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-3 pt-4">
            <button
              onClick={() => router.push("/reports")}
              className="px-6 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 shadow-sm cursor-pointer"
            >
              Open Engineering Reports
            </button>
            <button
              onClick={() => router.push("/analysis")}
              className="px-6 py-2.5 bg-sky-600 text-white rounded-lg text-sm font-semibold hover:bg-sky-700 shadow-sm cursor-pointer"
            >
              Open Historical Analysis
            </button>
            <button
              onClick={() => setStep("VISUALIZATION")}
              className="px-5 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Return to Visualisation
            </button>
          </div>
        </div>
      )}

      {/* Repair & Replacement Anomaly Review Modal */}
      <RepairAnomalyModal
        isOpen={showRepairModal}
        onClose={() => setShowRepairModal(false)}
        anomalies={anomalies}
        repairZones={repairZones}
        onAddRepairZone={(zone) => setRepairZones((prev) => [...prev, zone])}
        onRemoveRepairZone={(id) => setRepairZones((prev) => prev.filter((z) => z.id !== id))}
        onResolveAnomaly={(anomaly, wasRepaired, zone) => {
          if (wasRepaired && zone) {
            setRepairZones((prev) => [...prev, zone]);
          }
          setAnomalies((prev) => prev.filter((a) => a.indicationCode !== anomaly.indicationCode));
        }}
        currentWeldName={selectedWelds.includes("ALL") ? "C6" : selectedWelds[0]}
        currentDrumName={selectedDrums.includes("ALL") ? "All Coke Drums" : selectedDrums[0]}
      />

      {/* Customize & Rename Weld Joints Modal */}
      <RenameJointModal
        isOpen={showRenameModal}
        onClose={() => setShowRenameModal(false)}
        availableWelds={matrixResult?.availableWelds || []}
        activeWeld={selectedWelds[0] || "ALL"}
        jointAliases={jointAliases}
        onSaveAliases={(aliases) => setJointAliases(aliases)}
      />

      {/* Drum & Weld Specifications Quick Tuner Modal */}
      {showSpecsModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-sky-100 text-sky-700 rounded-lg">
                  <Sliders size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Weld &amp; Drum Geometry Specifications</h3>
                  <p className="text-xs text-slate-500">
                    {effectiveWeldKey ? `Tuning ${getJointDisplayName(effectiveWeldKey)} cross-sections & maps` : "Live parameter tuning for cross-sections & ring maps"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSpecsModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nominal Wall Thickness (mm)
                </label>
                <div className="relative flex items-center">
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    max="200"
                    value={specModalWall}
                    onChange={(e) => setSpecModalWall(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold text-slate-900 bg-white focus:ring-2 focus:ring-sky-500 focus:outline-none pr-8 text-right"
                  />
                  <span className="absolute right-3 text-xs font-bold text-slate-400 pointer-events-none">mm</span>
                </div>
                <span className="text-[10px] text-slate-400">Through-thickness shell wall dimension (Default: 32.0 mm)</span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Cladding Thickness (mm)
                </label>
                <div className="relative flex items-center">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="30"
                    value={specModalClad}
                    onChange={(e) => setSpecModalClad(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold text-slate-900 bg-white focus:ring-2 focus:ring-sky-500 focus:outline-none pr-8 text-right"
                  />
                  <span className="absolute right-3 text-xs font-bold text-slate-400 pointer-events-none">mm</span>
                </div>
                <span className="text-[10px] text-slate-400">Internal stainless steel clad thickness (Default: 3.0 mm)</span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Welding Joint Degrees (Total Groove Angle °)
                </label>
                <div className="relative flex items-center">
                  <input
                    type="number"
                    step="1"
                    min="10"
                    max="120"
                    value={specModalDegrees}
                    onChange={(e) => setSpecModalDegrees(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold text-slate-900 bg-white focus:ring-2 focus:ring-sky-500 focus:outline-none pr-7 text-right"
                  />
                  <span className="absolute right-3 text-xs font-bold text-slate-400 pointer-events-none">°</span>
                </div>
                <span className="text-[10px] text-slate-400">Total included groove angle (e.g. 60° total / 30° per side)</span>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-end gap-2">
              {effectiveWeldKey && (
                <button
                  type="button"
                  onClick={() => {
                    const wall = specModalWall.trim() || "32.0";
                    const clad = specModalClad.trim() || "3.0";
                    const deg = specModalDegrees.trim() || "60.0";
                    handleUpdateWeldSpec(effectiveWeldKey, "wallThickness", wall);
                    handleUpdateWeldSpec(effectiveWeldKey, "cladThickness", clad);
                    handleUpdateWeldSpec(effectiveWeldKey, "jointDegrees", deg);
                    setShowSpecsModal(false);
                  }}
                  className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2 rounded-lg shadow-xs transition-colors cursor-pointer"
                >
                  Update {getJointDisplayName(effectiveWeldKey)} Only
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  const wall = specModalWall.trim() || "32.0";
                  const clad = specModalClad.trim() || "3.0";
                  const deg = specModalDegrees.trim() || "60.0";
                  setMasterWallThickness(wall);
                  setMasterCladThickness(clad);
                  setMasterJointDegrees(deg);
                  setNominalWallThickness(parseFloat(wall) || 32.0);
                  setCladThickness(parseFloat(clad) || 3.0);
                  setJointDegrees(parseFloat(deg) || 60.0);

                  const updated: Record<string, { wallThickness: string; cladThickness: string; jointDegrees: string }> = {};
                  availableWeldsForSelectedDrums.forEach((w) => {
                    updated[w] = { wallThickness: wall, cladThickness: clad, jointDegrees: deg };
                  });
                  setWeldSpecs((prev) => ({ ...prev, ...updated }));
                  setShowSpecsModal(false);
                }}
                className="w-full sm:w-auto bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs px-4 py-2 rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                Apply to All Welds
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
