"use server";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { cokeDrums, weldJoints, inspections, inspectionObservations, physicalIndications, indicationMatches, repairEvents } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { computeIndicationHistories } from "@/lib/analytics/growthCalculator";

export async function getAnalysisDrums() {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const drumsList = await db.select().from(cokeDrums);
  return drumsList;
}

export async function getHistoricalAnalysisData(drumId: number) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  // 1. Drum & Weld details
  const [drum] = await db.select().from(cokeDrums).where(eq(cokeDrums.id, drumId)).limit(1);
  const welds = await db.select().from(weldJoints).where(eq(weldJoints.drumId, drumId));
  const weldMap = new Map(welds.map(w => [w.id, w.name]));

  // 2. All Inspections for Drum
  const drumInspections = await db
    .select()
    .from(inspections)
    .where(eq(inspections.drumId, drumId));
  
  drumInspections.sort((a, b) => new Date(a.inspectionDate).getTime() - new Date(b.inspectionDate).getTime());

  // 3. Aggregate Statistics per Inspection
  const allObs = drumInspections.length > 0 
    ? await db.select().from(inspectionObservations).where(inArray(inspectionObservations.inspectionId, drumInspections.map(i => i.id)))
    : [];

  const aggregateStats = drumInspections.map((insp) => {
    const campaignObs = allObs.filter(o => o.inspectionId === insp.id);
    const totalRecordedLength = campaignObs.reduce((acc, curr) => acc + curr.length, 0);
    return {
      inspectionId: insp.id,
      campaignName: insp.campaignName,
      inspectionDate: insp.inspectionDate,
      recordedCount: campaignObs.length,
      recordedLength: Math.round(totalRecordedLength * 10) / 10, // mm
    };
  });

  // 4. Physical Indications & Matched Observation Histories
  const PIs = await db.select().from(physicalIndications).where(eq(physicalIndications.drumId, drumId));
  
  let rawMatches: any[] = [];
  if (PIs.length > 0) {
    const piIds = PIs.map(p => p.id);
    const matches = await db.select().from(indicationMatches).where(inArray(indicationMatches.physicalIndicationId, piIds));
    
    if (matches.length > 0) {
      const obsIds = matches.map(m => m.observationId);
      const obsList = await db.select().from(inspectionObservations).where(inArray(inspectionObservations.id, obsIds));
      const obsMap = new Map(obsList.map(o => [o.id, o]));
      const inspMap = new Map(drumInspections.map(i => [i.id, i]));
      const piMap = new Map(PIs.map(p => [p.id, p]));

      rawMatches = matches.map(m => {
        const obs = obsMap.get(m.observationId)!;
        const insp = inspMap.get(obs.inspectionId)!;
        const pi = piMap.get(m.physicalIndicationId)!;
        return {
          physicalIndicationId: pi.id,
          code: pi.code,
          weldName: weldMap.get(pi.weldJointId) || "Weld",
          status: pi.status || "ACTIVE",
          observationId: obs.id,
          inspectionId: insp.id,
          inspectionDate: insp.inspectionDate,
          campaignName: insp.campaignName,
          circumferentialPosition: obs.circumferentialPosition || 0,
          length: obs.length,
          depth: obs.depth,
          indicationType: obs.indicationType || "PAUT Indication",
        };
      });
    }
  }

  const physicalHistories = computeIndicationHistories(rawMatches);
  const repairs = await db.select().from(repairEvents).where(eq(repairEvents.drumId, drumId));

  return {
    drum,
    welds,
    inspections: drumInspections,
    aggregateStats,
    physicalHistories,
    repairs,
  };
}
