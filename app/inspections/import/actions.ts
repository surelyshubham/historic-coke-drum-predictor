"use server";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { 
  cokeDrums, 
  weldJoints, 
  inspections, 
  inspectionFiles, 
  inspectionObservations, 
  physicalIndications, 
  indicationMatches, 
  repairEvents, 
  auditLogs 
} from "@/db/schema";
import { validateImportRows, ObservationImportRow } from "@/lib/validation/importSchema";
import { detectMatrixFormat, discoverCampaignsFromHeaders, parseMatrixRows, MatrixParseResult } from "@/lib/import/matrixParser";
import { eq, inArray } from "drizzle-orm";
import * as XLSX from "xlsx";

export async function getDrumsAndWelds() {
  const session = await auth();
  if (session?.user?.role !== "MASTER") {
    throw new Error("Unauthorized: Only Master users can access import tools.");
  }

  const drumsList = await db.select().from(cokeDrums);
  const weldsList = await db.select().from(weldJoints);

  return { drums: drumsList, welds: weldsList };
}

// Helper to auto-detect header row
function detectHeaderRow(aoa: unknown[][]): { headerIndex: number; headers: string[] } {
  const commonHeaderKeywords = ["ind", "weld", "joint", "circ", "pos", "len", "dep", "thick", "type", "amp", "segment", "no", "drum"];
  
  let bestRowIndex = 0;
  let maxKeywordScore = -1;
  let bestHeaders: string[] = [];

  for (let r = 0; r < Math.min(15, aoa.length); r++) {
    const row = aoa[r];
    if (!Array.isArray(row)) continue;

    let score = 0;
    const currentHeaders = row.map((cell, cIdx) => {
      const str = cell !== null && cell !== undefined ? String(cell).trim() : `Column_${cIdx + 1}`;
      const lower = str.toLowerCase();
      if (commonHeaderKeywords.some(k => lower.includes(k))) score += 2;
      return str;
    });

    if (score > maxKeywordScore && currentHeaders.length > 2) {
      maxKeywordScore = score;
      bestRowIndex = r;
      bestHeaders = currentHeaders;
    }
  }

  if (bestHeaders.length === 0 && aoa.length > 0) {
    bestHeaders = (aoa[0] || []).map((c, i) => String(c ?? `Column_${i + 1}`));
  }

  return { headerIndex: bestRowIndex, headers: bestHeaders };
}

export async function parseWorkbookFile(formData: FormData) {
  const session = await auth();
  if (session?.user?.role !== "MASTER") {
    throw new Error("Unauthorized");
  }

  const file = formData.get("file") as File;
  if (!file) {
    throw new Error("No file uploaded");
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const workbook = XLSX.read(buffer, { type: "buffer", raw: false, cellDates: false });

  const sheetNames = workbook.SheetNames;
  const sheetsData: Record<string, {
    detectedHeaderRow: number;
    headers: string[];
    sampleRows: Record<string, unknown>[];
    allRows: Record<string, unknown>[];
    totalRows: number;
    isMatrixFormat: boolean;
    matrixResult?: MatrixParseResult;
  }> = {};

  sheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const rawAoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
    const { headerIndex, headers } = detectHeaderRow(rawAoa);

    const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      range: headerIndex,
      defval: "",
      raw: false,
    });

    const isMatrix = detectMatrixFormat(headers);
    let matrixResult: MatrixParseResult | undefined;

    if (isMatrix) {
      const campaigns = discoverCampaignsFromHeaders(headers);
      matrixResult = parseMatrixRows(jsonRows, headers, campaigns);
    }

    sheetsData[sheetName] = {
      detectedHeaderRow: headerIndex,
      headers,
      sampleRows: jsonRows.slice(0, 5),
      allRows: jsonRows,
      totalRows: jsonRows.length,
      isMatrixFormat: isMatrix,
      matrixResult,
    };
  });

  // Guarantee strict plain object serialization across Server Action network boundary
  return JSON.parse(JSON.stringify({
    filename: file.name,
    sizeBytes: file.size,
    mimeType: file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    sheetNames,
    sheetsData,
  }));
}

export async function validateDatasetAction(
  rows: Record<string, unknown>[],
  fieldMapping: Record<string, string>,
  options?: {
    headerRowIndex?: number;
    validWeldNames?: string[];
  }
) {
  const session = await auth();
  if (session?.user?.role !== "MASTER") {
    throw new Error("Unauthorized");
  }

  return validateImportRows(rows, fieldMapping, options);
}

// Commit standard single-campaign import
export async function commitImportDatasetAction(payload: {
  drumId: number;
  campaignName: string;
  inspectionDate: string;
  filename: string;
  sizeBytes: number;
  mimeType: string;
  validRows: ObservationImportRow[];
}) {
  const session = await auth();
  if (session?.user?.role !== "MASTER") {
    throw new Error("Unauthorized");
  }

  const userId = parseInt(session.user.id as string);

  const drumWelds = await db.select().from(weldJoints).where(eq(weldJoints.drumId, payload.drumId));
  const weldMap = new Map(drumWelds.map(w => [w.name.toUpperCase().replace(/[^A-Z0-9]/g, ''), w.id]));
  const defaultWeldId = drumWelds[0]?.id;

  const [newInspection] = await db.insert(inspections).values({
    drumId: payload.drumId,
    campaignName: payload.campaignName,
    inspectionDate: new Date(payload.inspectionDate),
    inspectionType: 'PAUT/DRM',
    processingStatus: 'COMPLETED',
    validationStatus: 'VALIDATED',
    createdBy: userId,
  }).returning();

  const objectKey = `inspections/${payload.drumId}/${Date.now()}_${payload.filename}`;
  await db.insert(inspectionFiles).values({
    inspectionId: newInspection.id,
    filename: payload.filename,
    objectKey,
    sizeBytes: payload.sizeBytes,
    mimeType: payload.mimeType,
    status: 'PRESERVED',
    uploadedBy: userId,
  });

  const obsValues = payload.validRows.map(row => {
    const normName = row.weldName.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const matchedWeldId = weldMap.get(normName) || defaultWeldId;
    return {
      inspectionId: newInspection.id,
      sourceIndicationNumber: row.sourceIndicationNumber,
      weldJointId: matchedWeldId,
      circumferentialPosition: row.circumferentialPosition,
      axialPosition: row.axialPosition ?? null,
      length: row.length,
      depth: row.depth,
      amplitude: row.amplitude ?? null,
      indicationType: row.indicationType || 'PAUT Indication',
      result: row.result || 'RECORDED',
    };
  });

  const chunkSize = 200;
  for (let i = 0; i < obsValues.length; i += chunkSize) {
    const chunk = obsValues.slice(i, i + chunkSize);
    if (chunk.length > 0) {
      await db.insert(inspectionObservations).values(chunk);
    }
  }

  await db.insert(auditLogs).values({
    userId,
    action: 'DATA_IMPORT',
    objectType: 'inspections',
    objectId: String(newInspection.id),
    newValue: {
      campaignName: payload.campaignName,
      importedObservations: obsValues.length,
      filename: payload.filename,
    },
  });

  return { success: true, inspectionId: newInspection.id, importedCount: obsValues.length };
}

// Commit multi-campaign historical matrix dataset (like the PDF format)
export async function commitMatrixDatasetAction(payload: {
  drumId: number;
  filename: string;
  sizeBytes: number;
  mimeType: string;
  matrixResult: MatrixParseResult;
}) {
  const session = await auth();
  if (session?.user?.role !== "MASTER") {
    throw new Error("Unauthorized");
  }

  const userId = parseInt(session.user.id as string);
  const { drumId, matrixResult } = payload;

  // 1. Ensure all referenced weld joints exist in the Coke Drum
  const existingWelds = await db.select().from(weldJoints).where(eq(weldJoints.drumId, drumId));
  const weldLookup = new Map<string, number>();
  existingWelds.forEach(w => weldLookup.set(w.name.toUpperCase().replace(/[^A-Z0-9]/g, ''), w.id));

  // Collect unique welds in matrix
  const distinctWelds = new Set<string>();
  matrixResult.physicalIndications.forEach(pi => {
    if (pi.weldName) distinctWelds.add(pi.weldName.trim().toUpperCase());
  });

  for (const wName of Array.from(distinctWelds)) {
    const norm = wName.replace(/[^A-Z0-9]/g, '');
    if (!weldLookup.has(norm)) {
      const [newWeld] = await db.insert(weldJoints).values({
        drumId,
        name: wName,
        referenceDistance: 0,
        configuration: 'Circumferential Weld',
      }).returning();
      weldLookup.set(norm, newWeld.id);
    }
  }

  const defaultWeldId = existingWelds[0]?.id || Array.from(weldLookup.values())[0];

  // 2. Create or find Inspection campaigns in the database
  const campaignMap = new Map<string, number>();
  for (const camp of matrixResult.campaigns) {
    const [existing] = await db
      .select()
      .from(inspections)
      .where(eq(inspections.drumId, drumId))
      .limit(1);

    const [newInsp] = await db.insert(inspections).values({
      drumId,
      campaignName: camp.label,
      inspectionDate: new Date(camp.date),
      inspectionType: 'PAUT/DRM Matrix',
      processingStatus: 'COMPLETED',
      validationStatus: 'VALIDATED',
      createdBy: userId,
    }).returning();

    campaignMap.set(camp.key, newInsp.id);
  }

  // 3. Create persistent Physical Indications
  const piIdMap = new Map<string, number>();
  for (const pi of matrixResult.physicalIndications) {
    const normWeld = pi.weldName.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const wId = weldLookup.get(normWeld) || defaultWeldId;

    const [insertedPi] = await db.insert(physicalIndications).values({
      code: pi.code,
      drumId,
      weldJointId: wId,
      approximateLocation: pi.circumferentialPosition,
      status: pi.hasRepairs ? 'REPAIRED' : 'ACTIVE',
      matchingConfidence: 0.98,
      notes: `${pi.locationText} | ${pi.weldPosition}`,
    }).returning();

    piIdMap.set(pi.code, insertedPi.id);
  }

  // 4. Create Observation records and link them via indicationMatches
  const observationBatch: any[] = [];
  const piMatchPairs: Array<{ piCode: string; obsIndex: number; isRepair?: boolean }> = [];

  matrixResult.observations.forEach((obs, idx) => {
    const inspId = campaignMap.get(obs.campaignKey);
    if (!inspId) return;

    const normWeld = obs.weldName.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const wId = weldLookup.get(normWeld) || defaultWeldId;

    observationBatch.push({
      inspectionId: inspId,
      sourceIndicationNumber: obs.physicalIndicationCode,
      weldJointId: wId,
      circumferentialPosition: obs.circumferentialPosition,
      length: obs.length,
      depth: obs.depth,
      indicationType: obs.indicationType,
      result: obs.isAfterRepair ? 'POST_REPAIR' : 'RECORDED',
    });

    piMatchPairs.push({
      piCode: obs.physicalIndicationCode,
      obsIndex: observationBatch.length - 1,
      isRepair: obs.isAfterRepair,
    });
  });

  // Batch insert observations
  const insertedObservations: any[] = [];
  const chunkSize = 200;
  for (let i = 0; i < observationBatch.length; i += chunkSize) {
    const chunk = observationBatch.slice(i, i + chunkSize);
    if (chunk.length > 0) {
      const inserted = await db.insert(inspectionObservations).values(chunk).returning();
      insertedObservations.push(...inserted);
    }
  }

  // 5. Create Indication Matches
  const matchValues: any[] = [];
  piMatchPairs.forEach((pair) => {
    const piId = piIdMap.get(pair.piCode);
    const obs = insertedObservations[pair.obsIndex];
    if (piId && obs) {
      matchValues.push({
        physicalIndicationId: piId,
        observationId: obs.id,
        confidenceScore: 0.99,
        confidenceLevel: 'HIGH',
        matchExplanation: 'Extracted from Master Historical Summary Matrix tracking row',
        status: 'CONFIRMED',
        reviewedBy: userId,
        reviewedAt: new Date(),
      });
    }
  });

  for (let i = 0; i < matchValues.length; i += chunkSize) {
    const chunk = matchValues.slice(i, i + chunkSize);
    if (chunk.length > 0) {
      await db.insert(indicationMatches).values(chunk);
    }
  }

  // 6. Record Audit Log
  await db.insert(auditLogs).values({
    userId,
    action: 'MATRIX_IMPORT',
    objectType: 'inspections',
    objectId: String(drumId),
    newValue: {
      filename: payload.filename,
      campaignsCount: matrixResult.campaigns.length,
      physicalIndicationsCount: matrixResult.physicalIndications.length,
      observationsCount: insertedObservations.length,
    },
  });

  return {
    success: true,
    campaignsCount: matrixResult.campaigns.length,
    physicalIndicationsCount: matrixResult.physicalIndications.length,
    observationsCount: insertedObservations.length,
  };
}
