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
import { MatrixCampaignDef, TrackedPhysicalIndication } from "@/lib/import/matrixParser";
import { eq, inArray } from "drizzle-orm";

export const maxDuration = 60; // 60s execution limit on Vercel
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
    const action = payload.action || "legacy-save";

    // ─────────────────────────────────────────────────────────────
    // ACTION 1: INIT - Register Drums, Welds, and Campaigns (~3 KB payload)
    // ─────────────────────────────────────────────────────────────
    if (action === "init") {
      const {
        drumId,
        availableDrums = [],
        campaigns = [],
        distinctWelds = [],
        targetClientId,
        nominalWallThickness,
      } = payload as {
        drumId: number;
        availableDrums: string[];
        campaigns: MatrixCampaignDef[];
        distinctWelds: Array<{ drumName: string; weldName: string }>;
        targetClientId?: number;
        nominalWallThickness?: number;
      };

      // 1. Auto-register Coke Drums
      const existingDrums = await db.select().from(cokeDrums);
      const drumLookup: Record<string, number> = {};
      existingDrums.forEach((d) => {
        drumLookup[d.name.toUpperCase().trim()] = d.id;
      });

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

      for (const drumName of availableDrums) {
        const norm = drumName.toUpperCase().trim();
        if (!drumLookup[norm]) {
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
          drumLookup[norm] = newDrum.id;
        } else if (targetClientId || nominalWallThickness) {
          const updateData: Record<string, unknown> = {};
          if (targetClientId) updateData.clientId = targetClientId;
          if (nominalWallThickness) updateData.nominalThickness = nominalWallThickness;
          await db
            .update(cokeDrums)
            .set(updateData)
            .where(eq(cokeDrums.id, drumLookup[norm]));
        }
      }

      const getTargetDrumId = (dName?: string) => {
        if (!dName) return drumId;
        return drumLookup[dName.toUpperCase().trim()] || drumId;
      };

      // 2. Ensure Weld Joints exist
      const allExistingWelds = await db.select().from(weldJoints);
      const weldLookup: Record<string, number> = {};
      allExistingWelds.forEach((w) => {
        weldLookup[`${w.drumId}_${w.name.toUpperCase().replace(/[^A-Z0-9]/g, "")}`] = w.id;
      });

      for (const pair of distinctWelds) {
        const dId = getTargetDrumId(pair.drumName);
        const norm = (pair.weldName || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
        const key = `${dId}_${norm}`;
        if (!weldLookup[key]) {
          const [newWeld] = await db
            .insert(weldJoints)
            .values({
              drumId: dId,
              name: pair.weldName,
              referenceDistance: 0,
              configuration: "Circumferential Weld",
            })
            .returning();
          weldLookup[key] = newWeld.id;
        }
      }

      // 3. Create or reuse Inspection campaigns
      const campaignMap: Record<string, number> = {};
      const activeDrumIds = Array.from(
        new Set(availableDrums.map((d) => getTargetDrumId(d)))
      );
      if (activeDrumIds.length === 0) activeDrumIds.push(drumId);

      const existingInspections = await db.select().from(inspections);

      for (const targetDrumId of activeDrumIds) {
        for (const camp of campaigns) {
          const campKey = `${targetDrumId}_${camp.key}`;
          const campName = (camp.label || camp.key || "Campaign").substring(0, 250);
          const existing = existingInspections.find(
            (i) => i.drumId === targetDrumId && (i.campaignName === campName || i.campaignName === camp.key)
          );

          if (existing) {
            campaignMap[campKey] = existing.id;
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
            campaignMap[campKey] = newInsp.id;
          }
        }
      }

      return NextResponse.json({
        success: true,
        drumLookup,
        weldLookup,
        campaignMap,
        validUserId,
      });
    }

    // ─────────────────────────────────────────────────────────────
    // ACTION 2: SAVE-CHUNK - Insert batch of indications (~40-60 KB payload)
    // ─────────────────────────────────────────────────────────────
    if (action === "save-chunk") {
      const {
        indications = [],
        campaigns = [],
        drumLookup = {},
        weldLookup = {},
        campaignMap = {},
        fallbackDrumId = 1,
      } = payload as {
        indications: TrackedPhysicalIndication[];
        campaigns: MatrixCampaignDef[];
        drumLookup: Record<string, number>;
        weldLookup: Record<string, number>;
        campaignMap: Record<string, number>;
        fallbackDrumId: number;
      };

      const getTargetDrumId = (dName?: string) => {
        if (!dName) return fallbackDrumId;
        return drumLookup[dName.toUpperCase().trim()] || fallbackDrumId;
      };

      // 1. Prepare unique physical indications in this chunk
      const uniqueIndicationsMap = new Map<string, TrackedPhysicalIndication>();
      indications.forEach((pi) => {
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
        const wId = weldLookup[`${targetDrumId}_${normWeld}`] || 1;

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

      // Insert indications into database
      const piIdMap = new Map<string, number>();
      if (piRows.length > 0) {
        const insertedList = await db
          .insert(physicalIndications)
          .values(piRows)
          .onConflictDoNothing()
          .returning();

        insertedList.forEach((ins) => piIdMap.set(ins.code, ins.id));

        const missingCodes = piRows.map((r) => r.code).filter((c) => !piIdMap.has(c));
        if (missingCodes.length > 0) {
          const existing = await db
            .select({ id: physicalIndications.id, code: physicalIndications.code })
            .from(physicalIndications)
            .where(inArray(physicalIndications.code, missingCodes));
          existing.forEach((e) => piIdMap.set(e.code, e.id));
        }
      }

      // 2. Generate and insert observation records for this chunk
      const observationBatch: any[] = [];
      const piMatchPairs: Array<{ piCode: string; obsIndex: number }> = [];

      Array.from(uniqueIndicationsMap.values()).forEach((pi) => {
        const targetDrumId = getTargetDrumId(pi.drumName);
        const normWeld = (pi.weldName || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
        const wId = weldLookup[`${targetDrumId}_${normWeld}`] || 1;
        const safePos =
          typeof pi.circumferentialPosition === "number" && !isNaN(pi.circumferentialPosition)
            ? pi.circumferentialPosition
            : 0;

        campaigns.forEach((camp) => {
          const val = pi.campaignValues ? pi.campaignValues[camp.key] : null;
          if (val && typeof val.length === "number" && val.length > 0) {
            const inspId = campaignMap[`${targetDrumId}_${camp.key}`];
            if (!inspId) return;

            const safeLen = val.length;
            const safeDep =
              typeof val.depth === "number" && !isNaN(val.depth)
                ? val.depth
                : typeof pi.latestDepth === "number" && !isNaN(pi.latestDepth)
                ? pi.latestDepth
                : 3.0;

            observationBatch.push({
              inspectionId: inspId,
              sourceIndicationNumber: pi.code,
              weldJointId: wId,
              circumferentialPosition: safePos,
              length: safeLen,
              depth: safeDep,
              indicationType: (pi.indicationType || "Crack-like").substring(0, 95),
              result: camp.isAfterRepair ? "POST_REPAIR" : "RECORDED",
            });

            piMatchPairs.push({
              piCode: pi.code,
              obsIndex: observationBatch.length - 1,
            });
          }
        });
      });

      // Insert observations
      let insertedCount = 0;
      if (observationBatch.length > 0) {
        const insertedObs = await db
          .insert(inspectionObservations)
          .values(observationBatch)
          .returning();
        insertedCount = insertedObs.length;

        // 3. Link via indicationMatches
        const matchValues: any[] = [];
        piMatchPairs.forEach((pair) => {
          const piId = piIdMap.get(pair.piCode);
          const obs = insertedObs[pair.obsIndex];
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

        if (matchValues.length > 0) {
          await db.insert(indicationMatches).values(matchValues);
        }
      }

      return NextResponse.json({
        success: true,
        insertedIndications: piRows.length,
        insertedObservations: insertedCount,
      });
    }

    // ─────────────────────────────────────────────────────────────
    // ACTION 3: FINALIZE - Record Audit Log (~0.5 KB payload)
    // ─────────────────────────────────────────────────────────────
    if (action === "finalize") {
      const {
        drumId = 1,
        filename = "matrix_import.xlsx",
        totalIndications = 0,
        totalObservations = 0,
        campaignsCount = 0,
      } = payload;

      await db.insert(auditLogs).values({
        userId: validUserId,
        action: "MATRIX_IMPORT",
        objectType: "inspections",
        objectId: String(drumId),
        newValue: {
          filename,
          campaignsCount,
          physicalIndicationsCount: totalIndications,
          observationsCount: totalObservations,
        },
      });

      return NextResponse.json({
        success: true,
        completed: true,
        totalIndications,
        totalObservations,
      });
    }

    // Fallback: Unknown action
    return NextResponse.json(
      { success: false, error: `Unrecognized action: '${action}'` },
      { status: 400 }
    );
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
        }
      },
      { status: 500 }
    );
  }
}
