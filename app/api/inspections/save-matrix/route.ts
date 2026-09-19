import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { 
  users, 
  clients, 
  cokeDrums, 
  weldJoints, 
  inspections, 
  inspectionObservations, 
  physicalIndications, 
  indicationMatches, 
  auditLogs 
} from "@/db/schema";
import { MatrixParseResult } from "@/lib/import/matrixParser";
import { eq, inArray } from "drizzle-orm";

export const maxDuration = 60; // Allow up to 60 seconds execution on Vercel
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    const role = (session?.user as any)?.role;
    const userEmail = session?.user?.email || "No email in session";
    if (role !== "MASTER") {
      return NextResponse.json(
        { 
          success: false, 
          error: `Unauthorized: Current user '${userEmail}' has role '${role || "GUEST"}'. Only MASTER accounts (e.g. master@demo.com) can save datasets to the central database.`,
          debug: {
            userEmail,
            userRole: role || "GUEST",
            sessionExists: !!session,
            authHint: "Please sign in with a MASTER account to commit datasets to the central database."
          }
        },
        { status: 401 }
      );
    }

    // Safe user resolution ensuring userId exists in DB
    let validUserId: number | null = null;
    if (session?.user?.id && !isNaN(parseInt(session.user.id as string, 10))) {
      const candidateId = parseInt(session.user.id as string, 10);
      const [found] = await db.select().from(users).where(eq(users.id, candidateId)).limit(1);
      if (found) validUserId = found.id;
    }
    if (!validUserId && session?.user?.email) {
      const [dbUser] = await db.select().from(users).where(eq(users.email, session.user.email)).limit(1);
      if (dbUser) validUserId = dbUser.id;
    }
    if (!validUserId) {
      const [firstMaster] = await db.select().from(users).where(eq(users.role, "MASTER")).limit(1);
      if (firstMaster) validUserId = firstMaster.id;
    }
    if (!validUserId) {
      const [anyUser] = await db.select().from(users).limit(1);
      validUserId = anyUser?.id || 5;
    }

    const payload = await req.json();
    const { drumId, matrixResult, targetClientId, nominalWallThickness } = payload as {
      drumId: number;
      filename: string;
      sizeBytes: number;
      mimeType: string;
      matrixResult: MatrixParseResult;
      targetClientId?: number;
      nominalWallThickness?: number;
      cladThickness?: number;
      jointDegrees?: number;
      weldSpecs?: Record<string, { nominalWallThickness: number; cladThickness: number; jointDegrees: number }>;
    };

    if (!matrixResult || !matrixResult.availableDrums) {
      return NextResponse.json(
        { success: false, error: "Invalid payload: Matrix parse result is missing." },
        { status: 400 }
      );
    }

    // 0. Auto-register all unique drums detected in the matrix if missing
    const existingDrums = await db.select().from(cokeDrums);
    const drumLookup = new Map<string, number>();
    existingDrums.forEach((d) => drumLookup.set(d.name.toUpperCase().trim(), d.id));

    let defaultClientId = targetClientId || existingDrums[0]?.clientId;
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
            nominalThickness: nominalWallThickness || 32.0,
            material: "SA-387 Gr. 11 Cl. 2 (1.25Cr-0.5Mo)",
            status: "active",
          })
          .returning();
        drumLookup.set(norm, newDrum.id);
      } else {
        const existingDrumId = drumLookup.get(norm)!;
        const updateData: Record<string, unknown> = {};
        if (targetClientId) updateData.clientId = targetClientId;
        if (nominalWallThickness) updateData.nominalThickness = nominalWallThickness;
        if (Object.keys(updateData).length > 0) {
          await db
            .update(cokeDrums)
            .set(updateData)
            .where(eq(cokeDrums.id, existingDrumId));
        }
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

    // 2. Create or reuse Inspection campaigns in the database for each active drum
    const campaignMap = new Map<string, number>();
    const activeDrumIds = Array.from(
      new Set(matrixResult.availableDrums.map((d) => getTargetDrumId(d)))
    );

    const existingInspections = await db.select().from(inspections);

    for (const targetDrumId of activeDrumIds) {
      for (const camp of matrixResult.campaigns) {
        const campKey = `${targetDrumId}_${camp.key}`;
        const campName = (camp.label || camp.key || "Campaign").substring(0, 250);
        const existing = existingInspections.find(
          (i) => i.drumId === targetDrumId && (i.campaignName === campName || i.campaignName === camp.key)
        );

        if (existing) {
          campaignMap.set(campKey, existing.id);
        } else {
          const parsedDate = new Date(camp.date);
          const inspectionDate = isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
          const [newInsp] = await db
            .insert(inspections)
            .values({
              drumId: targetDrumId,
              campaignName: campName,
              inspectionDate,
              inspectionType: "PAUT/DRM Matrix",
              processingStatus: "COMPLETED",
              validationStatus: "VALIDATED",
              createdBy: validUserId,
            })
            .returning();
          campaignMap.set(campKey, newInsp.id);
        }
      }
    }

    // 3. Batch insert physical indications (chunked to prevent timeouts)
    const piIdMap = new Map<string, number>();

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

    const piChunkSize = 500;
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
    const obsChunkSize = 1000;
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

    return NextResponse.json({
      success: true,
      campaignsCount: matrixResult.campaigns.length,
      physicalIndicationsCount: matrixResult.physicalIndications.length,
      observationsCount: insertedObservations.length,
    });
  } catch (error: any) {
    console.error("Critical error in /api/inspections/save-matrix:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || "Failed to save dataset to database",
        debug: {
          errorName: error.name || "Error",
          errorCode: error.code || null,
          detail: error.detail || null,
          hint: error.hint || null,
          table: error.table || null,
          routine: error.routine || null,
        }
      },
      { status: 500 }
    );
  }
}
