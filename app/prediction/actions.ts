"use server";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { 
  cokeDrums, 
  weldJoints, 
  inspections, 
  inspectionObservations, 
  physicalIndications, 
  indicationMatches 
} from "@/db/schema";
import { eq, inArray, asc } from "drizzle-orm";
import { 
  generateGrowthPrediction, 
  HistoricalMeasurement, 
  PredictionModelType, 
  ScenarioType, 
  ThresholdConfig, 
  PredictionResult 
} from "@/lib/prediction/growthModel";

export interface IndicationOverviewItem {
  id: number;
  code: string;
  weldId: number;
  weldName: string;
  circumferentialPosition: number;
  currentDepth: number;
  currentLength: number;
  depthPercentOfWall: number;
  annualDepthRateMmYear: number;
  annualLengthRateMmYear: number;
  warningDate: string | null;
  warningDaysRemaining: number | null;
  criticalDate: string | null;
  criticalDaysRemaining: number | null;
  riskTier: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW';
  observationsCount: number;
  firstObservedDate: string | null;
  latestObservedDate: string | null;
}

export interface PredictionOverviewResponse {
  selectedDrum: {
    id: number;
    name: string;
    nominalThickness: number;
    diameter?: number | null;
  };
  availableDrums: Array<{ id: number; name: string }>;
  summary: {
    totalFlawsMonitored: number;
    criticalCount: number;
    highRiskCount: number;
    moderateCount: number;
    lowRiskCount: number;
    earliestWarningDate: string | null;
    earliestThroughWallDate: string | null;
    recommendedTurnaroundDate: string | null;
  };
  indications: IndicationOverviewItem[];
}

export async function getPredictionOverview(drumId?: number): Promise<PredictionOverviewResponse> {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Unauthorized: Please sign in.");
  }

  // 1. Fetch available drums
  const drumsList = await db.select().from(cokeDrums).orderBy(asc(cokeDrums.name));
  if (drumsList.length === 0) {
    throw new Error("No coke drums found in the system.");
  }

  const activeDrum = drumId 
    ? drumsList.find(d => d.id === drumId) || drumsList[0] 
    : drumsList[0];

  const nominalThickness = activeDrum.nominalThickness ?? 32.0;

  // 2. Fetch weld joints for this drum
  const welds = await db.select().from(weldJoints).where(eq(weldJoints.drumId, activeDrum.id));
  const weldMap = new Map(welds.map(w => [w.id, w.name]));

  // 3. Fetch inspections for this drum
  const drumInspections = await db.select().from(inspections).where(eq(inspections.drumId, activeDrum.id));
  const inspMap = new Map(drumInspections.map(i => [i.id, i]));

  // 4. Fetch physical indications for this drum
  const pis = await db.select().from(physicalIndications).where(eq(physicalIndications.drumId, activeDrum.id));

  const indicationItems: IndicationOverviewItem[] = [];

  if (pis.length > 0) {
    const piIds = pis.map(p => p.id);
    const matches = await db.select().from(indicationMatches).where(inArray(indicationMatches.physicalIndicationId, piIds));
    const obsIds = matches.map(m => m.observationId);

    let obsMap = new Map<number, typeof inspectionObservations.$inferSelect>();
    if (obsIds.length > 0) {
      const obsList = await db.select().from(inspectionObservations).where(inArray(inspectionObservations.id, obsIds));
      obsMap = new Map(obsList.map(o => [o.id, o]));
    }

    // Group observations by physical indication
    const piObsMap = new Map<number, Array<HistoricalMeasurement>>();
    for (const m of matches) {
      const obs = obsMap.get(m.observationId);
      if (!obs) continue;
      const insp = inspMap.get(obs.inspectionId);
      const inspDate = insp?.inspectionDate ? new Date(insp.inspectionDate) : new Date(obs.createdAt);
      const campaign = insp?.campaignName || "Campaign";

      const arr = piObsMap.get(m.physicalIndicationId) || [];
      arr.push({
        date: inspDate,
        campaignName: campaign,
        depth: obs.depth,
        length: obs.length,
        circumferentialPosition: obs.circumferentialPosition ?? 0,
      });
      piObsMap.set(m.physicalIndicationId, arr);
    }

    for (const pi of pis) {
      const obs = (piObsMap.get(pi.id) || []).sort((a, b) => a.date.getTime() - b.date.getTime());
      const measurements: HistoricalMeasurement[] = obs.length > 0 
        ? obs 
        : [{
            date: pi.latestObservedDate ? new Date(pi.latestObservedDate) : new Date(),
            campaignName: 'Current',
            depth: pi.currentDepth ?? 5.0,
            length: pi.currentLength ?? 20.0,
            circumferentialPosition: pi.approximateLocation ?? 0,
          }];

      const pred = generateGrowthPrediction(measurements, {
        modelType: 'LINEAR',
        scenario: 'MODERATE',
        thresholds: { nominalWallThickness: nominalThickness },
      });

      const currentDepth = pred.currentDepth;
      const depthPercentOfWall = Number(((currentDepth / nominalThickness) * 100).toFixed(1));

      indicationItems.push({
        id: pi.id,
        code: pi.code,
        weldId: pi.weldJointId,
        weldName: weldMap.get(pi.weldJointId) || `Weld-${pi.weldJointId}`,
        circumferentialPosition: pi.approximateLocation ?? (obs[0]?.circumferentialPosition || 0),
        currentDepth: Number(currentDepth.toFixed(2)),
        currentLength: Number(pred.currentLength.toFixed(1)),
        depthPercentOfWall,
        annualDepthRateMmYear: pred.annualDepthRateMmYear,
        annualLengthRateMmYear: pred.annualLengthRateMmYear,
        warningDate: pred.exceedance.warningDate ? pred.exceedance.warningDate.toISOString().split('T')[0] : null,
        warningDaysRemaining: pred.exceedance.warningDaysRemaining,
        criticalDate: pred.exceedance.criticalDate ? pred.exceedance.criticalDate.toISOString().split('T')[0] : null,
        criticalDaysRemaining: pred.exceedance.criticalDaysRemaining,
        riskTier: pred.exceedance.riskTier,
        observationsCount: obs.length,
        firstObservedDate: obs[0]?.date ? obs[0].date.toISOString().split('T')[0] : null,
        latestObservedDate: obs[obs.length - 1]?.date ? obs[obs.length - 1].date.toISOString().split('T')[0] : null,
      });
    }
  } else if (welds.length > 0) {
    // Fallback: If physical_indications table isn't populated for this drum, group observations from inspections
    const weldIds = welds.map(w => w.id);
    const obsList = await db.select().from(inspectionObservations).where(inArray(inspectionObservations.weldJointId, weldIds));

    // Group by weld & sourceIndicationNumber
    const grouped = new Map<string, typeof obsList>();
    for (const o of obsList) {
      const key = `${o.weldJointId}_${o.sourceIndicationNumber || `LOC_${Math.round(o.circumferentialPosition || 0)}`}`;
      const arr = grouped.get(key) || [];
      arr.push(o);
      grouped.set(key, arr);
    }

    let syntheticId = 1;
    for (const [key, obsArr] of grouped.entries()) {
      const firstObs = obsArr[0];
      const measurements: HistoricalMeasurement[] = obsArr.map(o => {
        const insp = inspMap.get(o.inspectionId);
        return {
          date: insp?.inspectionDate ? new Date(insp.inspectionDate) : new Date(o.createdAt),
          campaignName: insp?.campaignName || "Campaign",
          depth: o.depth,
          length: o.length,
          circumferentialPosition: o.circumferentialPosition ?? 0,
        };
      }).sort((a, b) => a.date.getTime() - b.date.getTime());

      const pred = generateGrowthPrediction(measurements, {
        modelType: 'LINEAR',
        scenario: 'MODERATE',
        thresholds: { nominalWallThickness: nominalThickness },
      });

      const currentDepth = pred.currentDepth;
      const depthPercentOfWall = Number(((currentDepth / nominalThickness) * 100).toFixed(1));

      indicationItems.push({
        id: syntheticId++,
        code: firstObs.sourceIndicationNumber ? `FLAW-${firstObs.sourceIndicationNumber}` : `DEF-${key}`,
        weldId: firstObs.weldJointId,
        weldName: weldMap.get(firstObs.weldJointId) || `Weld-${firstObs.weldJointId}`,
        circumferentialPosition: firstObs.circumferentialPosition ?? 0,
        currentDepth: Number(currentDepth.toFixed(2)),
        currentLength: Number(pred.currentLength.toFixed(1)),
        depthPercentOfWall,
        annualDepthRateMmYear: pred.annualDepthRateMmYear,
        annualLengthRateMmYear: pred.annualLengthRateMmYear,
        warningDate: pred.exceedance.warningDate ? pred.exceedance.warningDate.toISOString().split('T')[0] : null,
        warningDaysRemaining: pred.exceedance.warningDaysRemaining,
        criticalDate: pred.exceedance.criticalDate ? pred.exceedance.criticalDate.toISOString().split('T')[0] : null,
        criticalDaysRemaining: pred.exceedance.criticalDaysRemaining,
        riskTier: pred.exceedance.riskTier,
        observationsCount: obsArr.length,
        firstObservedDate: measurements[0]?.date ? measurements[0].date.toISOString().split('T')[0] : null,
        latestObservedDate: measurements[measurements.length - 1]?.date ? measurements[measurements.length - 1].date.toISOString().split('T')[0] : null,
      });
    }
  }

  // Sort by risk priority: CRITICAL first, then by warningDaysRemaining asc
  const tierWeights: Record<string, number> = { CRITICAL: 0, HIGH: 1, MODERATE: 2, LOW: 3 };
  indicationItems.sort((a, b) => {
    const wDiff = tierWeights[a.riskTier] - tierWeights[b.riskTier];
    if (wDiff !== 0) return wDiff;
    const aDays = a.warningDaysRemaining ?? 99999;
    const bDays = b.warningDaysRemaining ?? 99999;
    return aDays - bDays;
  });

  // Calculate summary stats
  const criticalCount = indicationItems.filter(i => i.riskTier === 'CRITICAL').length;
  const highRiskCount = indicationItems.filter(i => i.riskTier === 'HIGH').length;
  const moderateCount = indicationItems.filter(i => i.riskTier === 'MODERATE').length;
  const lowRiskCount = indicationItems.filter(i => i.riskTier === 'LOW').length;

  const validWarningDates = indicationItems
    .filter(i => i.warningDate !== null)
    .map(i => i.warningDate as string)
    .sort();

  const validCriticalDates = indicationItems
    .filter(i => i.criticalDate !== null)
    .map(i => i.criticalDate as string)
    .sort();

  const earliestWarningDate = validWarningDates[0] || null;
  const earliestThroughWallDate = validCriticalDates[0] || null;

  // Recommended Turnaround: ~6 months prior to earliest warning date
  let recommendedTurnaroundDate: string | null = null;
  if (earliestWarningDate) {
    const d = new Date(earliestWarningDate);
    d.setDate(d.getDate() - 180);
    recommendedTurnaroundDate = d.toISOString().split('T')[0];
  }

  return JSON.parse(JSON.stringify({
    selectedDrum: {
      id: activeDrum.id,
      name: activeDrum.name,
      nominalThickness,
      diameter: activeDrum.diameter,
    },
    availableDrums: drumsList.map(d => ({ id: d.id, name: d.name })),
    summary: {
      totalFlawsMonitored: indicationItems.length,
      criticalCount,
      highRiskCount,
      moderateCount,
      lowRiskCount,
      earliestWarningDate,
      earliestThroughWallDate,
      recommendedTurnaroundDate,
    },
    indications: indicationItems,
  }));
}

export async function calculateIndicationProjection(
  piId: number,
  options?: {
    modelType?: PredictionModelType;
    scenario?: ScenarioType;
    thresholds?: Partial<ThresholdConfig>;
    forecastYears?: number;
  }
): Promise<PredictionResult> {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Unauthorized: Please sign in.");
  }

  // 1. Fetch matches for this physical indication
  const matches = await db.select().from(indicationMatches).where(eq(indicationMatches.physicalIndicationId, piId));
  let measurements: HistoricalMeasurement[] = [];

  if (matches.length > 0) {
    const obsIds = matches.map(m => m.observationId);
    const obsList = await db.select().from(inspectionObservations).where(inArray(inspectionObservations.id, obsIds));
    const inspIds = [...new Set(obsList.map(o => o.inspectionId))];
    const insps = inspIds.length > 0 ? await db.select().from(inspections).where(inArray(inspections.id, inspIds)) : [];
    const inspMap = new Map(insps.map(i => [i.id, i]));

    measurements = obsList.map(o => {
      const insp = inspMap.get(o.inspectionId);
      return {
        date: insp?.inspectionDate ? new Date(insp.inspectionDate) : new Date(o.createdAt),
        campaignName: insp?.campaignName || "Campaign",
        depth: o.depth,
        length: o.length,
        circumferentialPosition: o.circumferentialPosition ?? 0,
      };
    });
  } else {
    // Check if piId exists in physicalIndications
    const [pi] = await db.select().from(physicalIndications).where(eq(physicalIndications.id, piId)).limit(1);
    if (pi) {
      measurements.push({
        date: pi.latestObservedDate ? new Date(pi.latestObservedDate) : new Date(),
        campaignName: "Current",
        depth: pi.currentDepth ?? 6.0,
        length: pi.currentLength ?? 30.0,
        circumferentialPosition: pi.approximateLocation ?? 0,
      });
    } else {
      // Fallback synthetic baseline
      measurements.push({
        date: new Date(),
        campaignName: "Current",
        depth: 8.0,
        length: 40.0,
      });
    }
  }

  // Generate projection
  const result = generateGrowthPrediction(measurements, options);

  return JSON.parse(JSON.stringify(result));
}
