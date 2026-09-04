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
  const workbook = XLSX.read(buffer, { type: "buffer" });

  const sheetNames = workbook.SheetNames;
  const sheetsData: Record<string, { headers: string[]; rows: Record<string, unknown>[] }> = {};

  sheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    const headers = jsonData.length > 0 ? Object.keys(jsonData[0]) : [];
    
    sheetsData[sheetName] = {
      headers,
      rows: jsonData.slice(0, 100), // Preview up to 100 rows
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
  fieldMapping: Record<string, string>
) {
  const session = await auth();
  if (session?.user?.role !== "MASTER") {
    throw new Error("Unauthorized");
  }

  return validateImportRows(rows, fieldMapping);
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
  const weldMap = new Map(drumWelds.map(w => [w.name.toUpperCase(), w.id]));
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

  // 4. Batch insert observations
  const obsValues = payload.validRows.map(row => {
    const matchedWeldId = weldMap.get(row.weldName.toUpperCase()) || defaultWeldId;
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

  if (obsValues.length > 0) {
    await db.insert(inspectionObservations).values(obsValues);
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
