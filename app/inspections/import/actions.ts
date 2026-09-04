"use server";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { cokeDrums, weldJoints, inspections, inspectionFiles, inspectionObservations, auditLogs } from "@/db/schema";
import { validateImportRows, ObservationImportRow } from "@/lib/validation/importSchema";
import { eq } from "drizzle-orm";
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
  const commonHeaderKeywords = ["ind", "weld", "joint", "circ", "pos", "len", "dep", "thick", "type", "amp", "da", "pa", "no"];
  
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
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });

  const sheetNames = workbook.SheetNames;
  const sheetsData: Record<string, {
    detectedHeaderRow: number;
    headers: string[];
    sampleRows: Record<string, unknown>[];
    allRows: Record<string, unknown>[];
    totalRows: number;
  }> = {};

  sheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    // Read raw sheet as Array of Arrays
    const rawAoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
    const { headerIndex, headers } = detectHeaderRow(rawAoa);

    // Convert sheet to JSON using detected headers
    const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      range: headerIndex,
      defval: "",
    });

    sheetsData[sheetName] = {
      detectedHeaderRow: headerIndex,
      headers,
      sampleRows: jsonRows.slice(0, 5),
      allRows: jsonRows,
      totalRows: jsonRows.length,
    };
  });

  return {
    filename: file.name,
    sizeBytes: file.size,
    mimeType: file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    sheetNames,
    sheetsData,
  };
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

  // 1. Get drum welds map
  const drumWelds = await db.select().from(weldJoints).where(eq(weldJoints.drumId, payload.drumId));
  const weldMap = new Map(drumWelds.map(w => [w.name.toUpperCase().replace(/[^A-Z0-9]/g, ''), w.id]));
  const defaultWeldId = drumWelds[0]?.id;

  // 2. Insert Inspection Campaign
  const [newInspection] = await db.insert(inspections).values({
    drumId: payload.drumId,
    campaignName: payload.campaignName,
    inspectionDate: new Date(payload.inspectionDate),
    inspectionType: 'PAUT/DRM',
    processingStatus: 'COMPLETED',
    validationStatus: 'VALIDATED',
    createdBy: userId,
  }).returning();

  // 3. Store File Metadata
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

  // 4. Batch insert observations (in chunks of 200 for DB safety)
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

  // 5. Audit Log Entry
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
