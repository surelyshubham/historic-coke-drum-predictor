"use server";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { 
  users,
  clients,
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
    throw new Error("Unauthorized: Only MASTER engineers can save datasets to the platform.");
  }

  // Safe user resolution to prevent NaN database errors
  let validUserId: number = 1;
  if (session?.user?.id && !isNaN(parseInt(session.user.id as string, 10))) {
    validUserId = parseInt(session.user.id as string, 10);
  } else if (session?.user?.email) {
    const [dbUser] = await db.select().from(users).where(eq(users.email, session.user.email)).limit(1);
    if (dbUser) validUserId = dbUser.id;
  }
  if (!validUserId) {
    const [firstMaster] = await db.select().from(users).where(eq(users.role, "MASTER")).limit(1);
    validUserId = firstMaster?.id || 1;
  }

  const { drumId, matrixResult } = payload;

  try {
    // 0. Auto-register all unique drums detected in the matrix if missing
    const existingDrums = await db.select().from(cokeDrums);
    const drumLookup = new Map<string, number>();
    existingDrums.forEach((d) => drumLookup.set(d.name.toUpperCase().trim(), d.id));

    let defaultClientId = existingDrums[0]?.clientId;
    if (!defaultClientId) {
      const existingClients = await db.select().from(clients);
      if (existingClients.length > 0) {
        defaultClientId = existingClients[0].id;
      } else {
        const [newClient] = await db
          .insert(clients)
          .values({
            name: "Refinery Facility",
            description: "Auto-created client facility for uploaded inspection data",
          })
          .returning();
        defaultClientId = newClient.id;
      }
    }

    for (const drumName of matrixResult.availableDrums) {
      const norm = drumName.toUpperCase().trim();
      if (!drumLookup.has(norm)) {
        const [newDrum] = await db
          .insert(cokeDrums)
          .values({
            clientId: defaultClientId,
            name: drumName,
            description: `Coke Drum ${drumName}`,
            diameter: 8.97,
            nominalThickness: 32.0,
            material: "SA-387 Gr. 11 Cl. 2 (1.25Cr-0.5Mo)",
            status: "active",
          })
          .returning();
        drumLookup.set(norm, newDrum.id);
      }
    }

    const getTargetDrumId = (dName?: string) => {
      if (!dName) return drumId;
      return drumLookup.get(dName.toUpperCase().trim()) || drumId;
    };

    // 1. Ensure all referenced weld joints exist for their respective Coke Drum
    const allExistingWelds = await db.select().from(weldJoints);
    const weldLookup = new Map<string, number>();
    allExistingWelds.forEach((w) =>
      weldLookup.set(`${w.drumId}_${w.name.toUpperCase().replace(/[^A-Z0-9]/g, "")}`, w.id)
    );

    const distinctWeldPairs = new Set<string>();
    matrixResult.physicalIndications.forEach((pi) => {
      if (pi.weldName) {
        const dId = getTargetDrumId(pi.drumName);
        distinctWeldPairs.add(`${dId}:::${pi.weldName.trim()}`);
      }
    });

    for (const pair of Array.from(distinctWeldPairs)) {
      const [dIdStr, wName] = pair.split(":::");
      const dId = parseInt(dIdStr, 10);
      const norm = wName.toUpperCase().replace(/[^A-Z0-9]/g, "");
      const key = `${dId}_${norm}`;
      if (!weldLookup.has(key)) {
        const [newWeld] = await db
          .insert(weldJoints)
          .values({
            drumId: dId,
            name: wName,
            referenceDistance: 0,
            configuration: "Circumferential Weld",
          })
          .returning();
        weldLookup.set(key, newWeld.id);
      }
    }

    // 2. Create or find Inspection campaigns in the database for each active drum
    const campaignMap = new Map<string, number>();
    const activeDrumIds = Array.from(
      new Set(matrixResult.availableDrums.map((d) => getTargetDrumId(d)))
    );

    for (const targetDrumId of activeDrumIds) {
      for (const camp of matrixResult.campaigns) {
        const parsedDate = new Date(camp.date);
        const inspectionDate = isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
        const [newInsp] = await db
          .insert(inspections)
          .values({
            drumId: targetDrumId,
            campaignName: (camp.label || camp.key || "Campaign").substring(0, 250),
            inspectionDate,
            inspectionType: "PAUT/DRM Matrix",
            processingStatus: "COMPLETED",
            validationStatus: "VALIDATED",
            createdBy: validUserId,
          })
          .returning();
        campaignMap.set(`${targetDrumId}_${camp.key}`, newInsp.id);
      }
    }

    // 3. Batch insert physical indications (chunked to prevent timeouts and duplicate key crashes)
    const piIdMap = new Map<string, number>();

    // Deduplicate indications by unique code within the matrix payload and limit code length to 48 chars
    const uniqueIndicationsMap = new Map<string, (typeof matrixResult.physicalIndications)[0]>();
    matrixResult.physicalIndications.forEach((pi) => {
      const safeCode =
        (pi.code || "").trim().length > 48
          ? (pi.code || "").trim().substring(0, 48)
          : (pi.code || "").trim();
      if (safeCode && !uniqueIndicationsMap.has(safeCode)) {
        uniqueIndicationsMap.set(safeCode, { ...pi, code: safeCode });
      }
    });

    const piRows = Array.from(uniqueIndicationsMap.values()).map((pi) => {
      const targetDrumId = getTargetDrumId(pi.drumName);
      const normWeld = (pi.weldName || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      const wId = weldLookup.get(`${targetDrumId}_${normWeld}`) || allExistingWelds[0]?.id || 1;

      return {
        code: pi.code,
        drumId: targetDrumId,
        weldJointId: wId,
        approximateLocation:
          typeof pi.circumferentialPosition === "number" && !isNaN(pi.circumferentialPosition)
            ? pi.circumferentialPosition
            : 0,
        currentLength:
          typeof pi.latestLength === "number" && !isNaN(pi.latestLength) ? pi.latestLength : 0,
        currentDepth:
          typeof pi.latestDepth === "number" && !isNaN(pi.latestDepth) ? pi.latestDepth : 0,
        status: pi.hasRepairs ? "REPAIRED" : "ACTIVE",
        matchingConfidence: 0.98,
        notes: `${pi.locationText || ""} | ${pi.weldPosition || ""}`.substring(0, 490),
      };
    });

    const piChunkSize = 200;
    for (let i = 0; i < piRows.length; i += piChunkSize) {
      const chunk = piRows.slice(i, i + piChunkSize);
      if (chunk.length > 0) {
        const insertedList = await db
          .insert(physicalIndications)
          .values(chunk)
          .onConflictDoNothing()
          .returning();

        insertedList.forEach((ins) => piIdMap.set(ins.code, ins.id));
      }
    }

    // If any indications already existed in DB, query their IDs to populate piIdMap
    const missingCodes = piRows.map((r) => r.code).filter((c) => !piIdMap.has(c));
    if (missingCodes.length > 0) {
      for (let i = 0; i < missingCodes.length; i += piChunkSize) {
        const chunk = missingCodes.slice(i, i + piChunkSize);
        const existing = await db
          .select({ id: physicalIndications.id, code: physicalIndications.code })
          .from(physicalIndications)
          .where(inArray(physicalIndications.code, chunk));
        existing.forEach((e) => piIdMap.set(e.code, e.id));
      }
    }

    // 4. Create Observation records and link them via indicationMatches
    const observationBatch: any[] = [];
    const piMatchPairs: Array<{ piCode: string; obsIndex: number; isRepair?: boolean }> = [];

    matrixResult.observations.forEach((obs) => {
      const targetDrumId = getTargetDrumId(obs.drumName);
      const inspId = campaignMap.get(`${targetDrumId}_${obs.campaignKey}`);
      if (!inspId) return;

      const normWeld = (obs.weldName || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      const wId = weldLookup.get(`${targetDrumId}_${normWeld}`) || allExistingWelds[0]?.id || 1;

      const safeLen = typeof obs.length === "number" && !isNaN(obs.length) ? obs.length : 0;
      const safeDep = typeof obs.depth === "number" && !isNaN(obs.depth) ? obs.depth : 0;
      const safePos =
        typeof obs.circumferentialPosition === "number" && !isNaN(obs.circumferentialPosition)
          ? obs.circumferentialPosition
          : 0;
      const safePiCode =
        (obs.physicalIndicationCode || "").trim().length > 48
          ? (obs.physicalIndicationCode || "").trim().substring(0, 48)
          : (obs.physicalIndicationCode || "").trim();

      observationBatch.push({
        inspectionId: inspId,
        sourceIndicationNumber: safePiCode,
        weldJointId: wId,
        circumferentialPosition: safePos,
        length: safeLen,
        depth: safeDep,
        indicationType: (obs.indicationType || "Crack-like").substring(0, 95),
        result: obs.isAfterRepair ? "POST_REPAIR" : "RECORDED",
      });

      piMatchPairs.push({
        piCode: safePiCode,
        obsIndex: observationBatch.length - 1,
        isRepair: obs.isAfterRepair,
      });
    });

    // Batch insert observations
    const insertedObservations: any[] = [];
    const obsChunkSize = 200;
    for (let i = 0; i < observationBatch.length; i += obsChunkSize) {
      const chunk = observationBatch.slice(i, i + obsChunkSize);
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
          confidenceLevel: "HIGH",
          matchExplanation: "Extracted from Master Historical Summary Matrix tracking row",
          status: "CONFIRMED",
          reviewedBy: validUserId,
          reviewedAt: new Date(),
        });
      }
    });

    for (let i = 0; i < matchValues.length; i += obsChunkSize) {
      const chunk = matchValues.slice(i, i + obsChunkSize);
      if (chunk.length > 0) {
        await db.insert(indicationMatches).values(chunk);
      }
    }

    // 6. Record Audit Log
    await db.insert(auditLogs).values({
      userId: validUserId,
      action: "MATRIX_IMPORT",
      objectType: "inspections",
      objectId: String(drumId),
      newValue: {
        filename: payload.filename || "matrix_import.xlsx",
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
  } catch (error: any) {
    console.error("Critical error in commitMatrixDatasetAction:", error);
    throw new Error(error.message || "Failed to save dataset to database");
  }
}
