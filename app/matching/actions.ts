"use server";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { 
  cokeDrums, 
  weldJoints, 
  inspections, 
  inspectionObservations, 
  physicalIndications, 
  indicationMatches, 
  auditLogs 
} from "@/db/schema";
import { eq, inArray, desc } from "drizzle-orm";
import { rankMatchingCandidates, MatchingCandidateObservation, MatchingCandidatePhysicalIndication } from "@/lib/matching/matcher";

export async function getMatchingOverviewData(drumId: number) {
  const session = await auth();
  if (session?.user?.role !== "MASTER") {
    throw new Error("Unauthorized: Only Master users can review indication matches.");
  }

  // 1. Drum & Welds
  const [drum] = await db.select().from(cokeDrums).where(eq(cokeDrums.id, drumId)).limit(1);
  const welds = await db.select().from(weldJoints).where(eq(weldJoints.drumId, drumId));
  const weldMap = new Map(welds.map(w => [w.id, w.name]));

  // 2. Physical indications for this drum
  const pis = await db.select().from(physicalIndications).where(eq(physicalIndications.drumId, drumId));
  const piMap = new Map(pis.map(p => [p.id, p]));

  // 3. Inspections for this drum
  const drumInspections = await db.select().from(inspections).where(eq(inspections.drumId, drumId));
  const inspMap = new Map(drumInspections.map(i => [i.id, i.campaignName]));

  // 4. Matches for physical indications of this drum
  let matches: any[] = [];
  if (pis.length > 0) {
    const piIds = pis.map(p => p.id);
    const rawMatches = await db
      .select()
      .from(indicationMatches)
      .where(inArray(indicationMatches.physicalIndicationId, piIds))
      .orderBy(desc(indicationMatches.createdAt));

    if (rawMatches.length > 0) {
      const obsIds = rawMatches.map(m => m.observationId);
      const obsList = await db.select().from(inspectionObservations).where(inArray(inspectionObservations.id, obsIds));
      const obsMap = new Map(obsList.map(o => [o.id, o]));

      matches = rawMatches.map(m => {
        const obs = obsMap.get(m.observationId);
        const pi = piMap.get(m.physicalIndicationId);
        return {
          id: m.id,
          physicalIndicationId: m.physicalIndicationId,
          physicalIndicationCode: pi?.code || "PI-UNKNOWN",
          approximateLocation: pi?.approximateLocation || 0,
          piLength: pi?.currentLength,
          piDepth: pi?.currentDepth,
          piStatus: pi?.status || "ACTIVE",
          observationId: m.observationId,
          campaignName: obs ? (inspMap.get(obs.inspectionId) || "Campaign") : "Campaign",
          weldName: obs ? (weldMap.get(obs.weldJointId) || "Weld") : "Weld",
          weldJointId: obs?.weldJointId || 1,
          circumferentialPosition: obs?.circumferentialPosition || 0,
          obsLength: obs?.length || 0,
          obsDepth: obs?.depth || 0,
          confidenceScore: m.confidenceScore || 90,
          confidenceLevel: m.confidenceLevel || "HIGH",
          matchExplanation: m.matchExplanation || "Automated Spatial Match",
          status: m.status || "AUTOMATIC",
          reviewedAt: m.reviewedAt,
        };
      });
    }
  }

  // 5. Recent Audit Logs for Matching
  const logs = await db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.objectType, "indication_matches"))
    .orderBy(desc(auditLogs.createdAt))
    .limit(10);

  return JSON.parse(JSON.stringify({
    drum,
    welds,
    pis,
    matches,
    auditLogs: logs,
  }));
}

// 1. Confirm Match
export async function confirmMatchAction(matchId: number) {
  const session = await auth();
  if (session?.user?.role !== "MASTER") throw new Error("Unauthorized");
  const userId = parseInt(session.user.id as string);

  const [existing] = await db.select().from(indicationMatches).where(eq(indicationMatches.id, matchId)).limit(1);
  if (!existing) throw new Error("Match not found");

  await db.update(indicationMatches)
    .set({
      status: "CONFIRMED",
      reviewedBy: userId,
      reviewedAt: new Date(),
    })
    .where(eq(indicationMatches.id, matchId));

  await db.insert(auditLogs).values({
    userId,
    action: "MATCH_CONFIRM",
    objectType: "indication_matches",
    objectId: String(matchId),
    previousValue: { status: existing.status },
    newValue: { status: "CONFIRMED" },
  });

  return { success: true };
}

// 2. Reject Match
export async function rejectMatchAction(matchId: number, reason: string = "User rejected candidate match") {
  const session = await auth();
  if (session?.user?.role !== "MASTER") throw new Error("Unauthorized");
  const userId = parseInt(session.user.id as string);

  const [existing] = await db.select().from(indicationMatches).where(eq(indicationMatches.id, matchId)).limit(1);
  if (!existing) throw new Error("Match not found");

  await db.update(indicationMatches)
    .set({
      status: "REJECTED",
      matchExplanation: `Rejected: ${reason}`,
      reviewedBy: userId,
      reviewedAt: new Date(),
    })
    .where(eq(indicationMatches.id, matchId));

  await db.insert(auditLogs).values({
    userId,
    action: "MATCH_REJECT",
    objectType: "indication_matches",
    objectId: String(matchId),
    previousValue: { status: existing.status, explanation: existing.matchExplanation },
    newValue: { status: "REJECTED", reason },
  });

  return { success: true };
}

// 3. Override Match (Reassign to different Physical Indication)
export async function overrideMatchAction(
  matchId: number, 
  targetPhysicalIndicationId: number, 
  reason: string
) {
  const session = await auth();
  if (session?.user?.role !== "MASTER") throw new Error("Unauthorized");
  const userId = parseInt(session.user.id as string);

  const [existing] = await db.select().from(indicationMatches).where(eq(indicationMatches.id, matchId)).limit(1);
  if (!existing) throw new Error("Match not found");

  const [targetPi] = await db.select().from(physicalIndications).where(eq(physicalIndications.id, targetPhysicalIndicationId)).limit(1);
  if (!targetPi) throw new Error("Target physical indication not found");

  await db.update(indicationMatches)
    .set({
      physicalIndicationId: targetPhysicalIndicationId,
      status: "OVERRIDDEN",
      matchExplanation: `Manual Override: Reassigned to ${targetPi.code}. Reason: ${reason}`,
      reviewedBy: userId,
      reviewedAt: new Date(),
    })
    .where(eq(indicationMatches.id, matchId));

  await db.insert(auditLogs).values({
    userId,
    action: "MATCH_OVERRIDE",
    objectType: "indication_matches",
    objectId: String(matchId),
    previousValue: { physicalIndicationId: existing.physicalIndicationId },
    newValue: { physicalIndicationId: targetPhysicalIndicationId, targetCode: targetPi.code, reason },
  });

  return { success: true };
}

// 4. Create New Physical Indication from Unmatched Observation
export async function createNewPhysicalIndicationFromMatchAction(
  matchId: number,
  newCode: string,
  drumId: number,
  reason: string
) {
  const session = await auth();
  if (session?.user?.role !== "MASTER") throw new Error("Unauthorized");
  const userId = parseInt(session.user.id as string);

  const [existing] = await db.select().from(indicationMatches).where(eq(indicationMatches.id, matchId)).limit(1);
  if (!existing) throw new Error("Match not found");

  const [obs] = await db.select().from(inspectionObservations).where(eq(inspectionObservations.id, existing.observationId)).limit(1);
  if (!obs) throw new Error("Observation not found");

  // Create new Physical Indication
  const [newPi] = await db.insert(physicalIndications).values({
    code: newCode,
    drumId,
    weldJointId: obs.weldJointId,
    approximateLocation: obs.circumferentialPosition,
    currentLength: obs.length,
    currentDepth: obs.depth,
    status: "ACTIVE",
    matchingConfidence: 1.0,
    notes: `Created from manual split/override of Observation #${obs.id}. Reason: ${reason}`,
  }).returning();

  // Re-link match to this new PI
  await db.update(indicationMatches)
    .set({
      physicalIndicationId: newPi.id,
      status: "OVERRIDDEN",
      matchExplanation: `Promoted to standalone flaw ${newCode}. Reason: ${reason}`,
      reviewedBy: userId,
      reviewedAt: new Date(),
    })
    .where(eq(indicationMatches.id, matchId));

  await db.insert(auditLogs).values({
    userId,
    action: "CREATE_PI_OVERRIDE",
    objectType: "indication_matches",
    objectId: String(matchId),
    newValue: { newPhysicalIndicationId: newPi.id, newCode, reason },
  });

  return { success: true, newPiCode: newPi.code };
}
