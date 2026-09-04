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
  clients
} from "@/db/schema";
import { eq, inArray, asc } from "drizzle-orm";
import { 
  generateGrowthPrediction, 
  HistoricalMeasurement 
} from "@/lib/prediction/growthModel";
import { 
  ReportPayload, 
  ReportIndicationItem, 
  FlawCampaignRecord 
} from "@/lib/reports/reportTypes";
import * as XLSX from "xlsx";
import { 
  detectHeaderRow, 
  detectMatrixFormat, 
  discoverCampaignsFromHeaders, 
  parseMatrixRows, 
  MatrixParseResult 
} from "@/lib/import/matrixParser";

export async function parseUploadedExcelReportData(formData: FormData, selectedDrumName?: string, selectedWeldName?: string): Promise<ReportPayload> {
  const file = formData.get("file") as File;
  if (!file) {
    throw new Error("No file uploaded");
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const workbook = XLSX.read(buffer, { type: "buffer", raw: false, cellDates: false });

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error("Uploaded workbook has no sheets.");
  }

  // Find the first sheet that matches matrix or has data
  let parsedMatrix: MatrixParseResult | null = null;
  for (const sName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sName];
    const rawAoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
    const { headerIndex, headers } = detectHeaderRow(rawAoa);
    const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      range: headerIndex,
      defval: "",
      raw: false,
    });

    if (jsonRows.length > 0) {
      const isMatrix = detectMatrixFormat(headers);
      const campaigns = isMatrix ? discoverCampaignsFromHeaders(headers) : [];
      if (campaigns.length > 0) {
        parsedMatrix = parseMatrixRows(jsonRows, headers, campaigns);
        break;
      }
    }
  }

  if (!parsedMatrix || parsedMatrix.physicalIndications.length === 0) {
    throw new Error("Could not parse PAUT inspection matrix from the uploaded Excel file. Please ensure multi-campaign columns (e.g. OCT-23, APR-24, etc.) are present.");
  }

  return buildReportPayloadFromMatrix(parsedMatrix, selectedDrumName, selectedWeldName);
}

export async function buildReportPayloadFromMatrix(
  matrix: MatrixParseResult,
  targetDrumName?: string,
  targetWeldName?: string
): Promise<ReportPayload> {
  const nominalThickness = 32.0;
  const diameter = 8.97;

  const availableDrumNames = matrix.availableDrums.length > 0 ? matrix.availableDrums : ["R01"];
  const activeDrumName = targetDrumName && availableDrumNames.includes(targetDrumName)
    ? targetDrumName
    : availableDrumNames[0];

  const availableWeldsForDrum = matrix.weldsByDrum[activeDrumName] || matrix.availableWelds;
  const activeWeldName = targetWeldName && availableWeldsForDrum.includes(targetWeldName)
    ? targetWeldName
    : (targetWeldName === "ALL" ? null : (availableWeldsForDrum[0] || null));

  // Filter indications for this drum and weld
  let matchingIndications = matrix.physicalIndications.filter(pi => pi.drumName === activeDrumName);
  if (activeWeldName) {
    matchingIndications = matchingIndications.filter(pi => pi.weldName === activeWeldName);
  }

  const allCampaignNames = matrix.campaigns.map(c => c.key);

  const indicationItems: ReportIndicationItem[] = matchingIndications.map((pi, idx) => {
    // Build historical measurements
    const measurements: HistoricalMeasurement[] = [];
    const campaignHistory: FlawCampaignRecord[] = [];

    matrix.campaigns.forEach(c => {
      const val = pi.campaignValues[c.key];
      if (val && val.length !== null && val.depth !== null) {
        measurements.push({
          date: new Date(c.date),
          campaignName: c.key,
          depth: val.depth,
          length: val.length,
          circumferentialPosition: pi.circumferentialPosition,
        });
        campaignHistory.push({
          campaignName: c.key,
          inspectionDate: c.date,
          length: val.length,
          depth: val.depth,
        });
      }
    });

    const pred = generateGrowthPrediction(
      measurements.length > 0
        ? measurements
        : [
            {
              date: new Date(),
              campaignName: "Current",
              depth: pi.latestDepth || 4.0,
              length: pi.latestLength || 30.0,
              circumferentialPosition: pi.circumferentialPosition,
            },
          ],
      {
        modelType: "LINEAR",
        scenario: "MODERATE",
        thresholds: { nominalWallThickness: nominalThickness },
      }
    );

    const currentDepth = pred.currentDepth;
    const depthPercentOfWall = Number(((currentDepth / nominalThickness) * 100).toFixed(1));

    return {
      id: idx + 1,
      code: pi.code,
      weldId: idx + 1,
      weldName: pi.weldName,
      circumferentialPosition: pi.circumferentialPosition,
      segment: pi.segment,
      weldPosition: pi.weldPosition,
      currentLength: Number(pred.currentLength.toFixed(1)),
      currentDepth: Number(currentDepth.toFixed(2)),
      depthPercentOfWall,
      growthRateYear: pred.annualDepthRateMmYear,
      warningDate: pred.exceedance.warningDate ? pred.exceedance.warningDate.toISOString().split("T")[0] : null,
      warningDaysRemaining: pred.exceedance.warningDaysRemaining,
      criticalDate: pred.exceedance.criticalDate ? pred.exceedance.criticalDate.toISOString().split("T")[0] : null,
      criticalDaysRemaining: pred.exceedance.criticalDaysRemaining,
      riskTier: pred.exceedance.riskTier,
      campaignHistory,
    };
  });

  // Sort by risk priority
  const riskOrder = { CRITICAL: 0, HIGH: 1, MODERATE: 2, LOW: 3 };
  indicationItems.sort((a, b) => {
    if (riskOrder[a.riskTier] !== riskOrder[b.riskTier]) {
      return riskOrder[a.riskTier] - riskOrder[b.riskTier];
    }
    const daysA = a.warningDaysRemaining ?? 99999;
    const daysB = b.warningDaysRemaining ?? 99999;
    return daysA - daysB;
  });

  const criticalCount = indicationItems.filter(i => i.riskTier === "CRITICAL").length;
  const highRiskCount = indicationItems.filter(i => i.riskTier === "HIGH").length;
  const moderateCount = indicationItems.filter(i => i.riskTier === "MODERATE").length;
  const lowRiskCount = indicationItems.filter(i => i.riskTier === "LOW").length;

  const validWarningDays = indicationItems
    .map(i => i.warningDaysRemaining)
    .filter((d): d is number => d !== null && d >= 0)
    .sort((a, b) => a - b);

  const validThroughWallDays = indicationItems
    .map(i => i.criticalDaysRemaining)
    .filter((d): d is number => d !== null && d >= 0)
    .sort((a, b) => a - b);

  const earliestWarningDays = validWarningDays.length > 0 ? validWarningDays[0] : null;
  const earliestThroughWallDays = validThroughWallDays.length > 0 ? validThroughWallDays[0] : null;

  const earliestWarningItem = indicationItems.find(i => i.warningDaysRemaining === earliestWarningDays);
  const earliestThroughWallItem = indicationItems.find(i => i.criticalDaysRemaining === earliestThroughWallDays);

  let recommendedTurnaroundDate: string | null = null;
  if (earliestWarningItem?.warningDate) {
    const d = new Date(earliestWarningItem.warningDate);
    d.setMonth(d.getMonth() - 6);
    recommendedTurnaroundDate = d.toISOString().split("T")[0];
  }

  const drumListObjs = availableDrumNames.map((name, i) => ({ id: i + 1, name }));
  const activeDrumObj = drumListObjs.find(d => d.name === activeDrumName) || drumListObjs[0];

  const weldListObjs = availableWeldsForDrum.map((name, i) => ({
    id: i + 1,
    name,
    drumId: activeDrumObj.id,
  }));

  const activeWeldObj = activeWeldName ? weldListObjs.find(w => w.name === activeWeldName) : null;

  return {
    vesselInfo: {
      id: activeDrumObj.id,
      name: activeDrumName,
      nominalThickness,
      diameter,
      material: "SA-387 Gr. 11 Cl. 2 (1.25Cr-0.5Mo)",
      clientName: "Uploaded Dataset / Refinery",
      status: "active",
    },
    executiveSummary: {
      monitoredFlawsCount: indicationItems.length,
      criticalCount,
      highRiskCount,
      moderateCount,
      lowRiskCount,
      earliestWarningDate: earliestWarningItem?.warningDate ?? null,
      earliestWarningDays,
      earliestThroughWallDate: earliestThroughWallItem?.criticalDate ?? null,
      earliestThroughWallDays,
      recommendedTurnaroundDate,
    },
    availableDrums: drumListObjs,
    availableWelds: weldListObjs,
    indications: indicationItems,
    selectedWeldId: activeWeldObj?.id ?? null,
    selectedIndicationId: indicationItems[0]?.id ?? null,
    allCampaignNames,
  };
}

export async function getReportData(drumId?: number, weldId?: number): Promise<ReportPayload> {
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
  const diameter = activeDrum.diameter ?? 8.97;

  // Fetch client details
  let clientName = "Refinery Operations";
  if (activeDrum.clientId) {
    const clientList = await db.select().from(clients).where(eq(clients.id, activeDrum.clientId));
    if (clientList.length > 0) {
      clientName = clientList[0].name;
    }
  }

  // 2. Fetch all weld joints for this drum
  const welds = await db.select().from(weldJoints).where(eq(weldJoints.drumId, activeDrum.id)).orderBy(asc(weldJoints.name));
  const weldMap = new Map(welds.map(w => [w.id, w.name]));

  // 3. Fetch all inspections for this drum
  const drumInspections = await db.select().from(inspections).where(eq(inspections.drumId, activeDrum.id)).orderBy(asc(inspections.inspectionDate));
  const inspMap = new Map(drumInspections.map(i => [i.id, i]));
  const allCampaignNames = Array.from(new Set(drumInspections.map(i => i.campaignName)));

  // 4. Fetch physical indications for this drum
  const pis = await db.select().from(physicalIndications).where(eq(physicalIndications.drumId, activeDrum.id));

  let indicationItems: ReportIndicationItem[] = [];

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
    const piObsMap = new Map<number, Array<{
      date: Date;
      campaignName: string;
      length: number;
      depth: number;
      circumferentialPosition: number;
      segment?: string;
    }>>();

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
        length: obs.length,
        depth: obs.depth,
        circumferentialPosition: obs.circumferentialPosition ?? 0,
        segment: obs.rawSourceData && typeof obs.rawSourceData === 'object' && 'SEGMENT [M]' in obs.rawSourceData
          ? String((obs.rawSourceData as any)['SEGMENT [M]'])
          : undefined
      });
      piObsMap.set(m.physicalIndicationId, arr);
    }

    for (const pi of pis) {
      const obsList = (piObsMap.get(pi.id) || []).sort((a, b) => a.date.getTime() - b.date.getTime());
      
      const measurements: HistoricalMeasurement[] = obsList.length > 0 
        ? obsList.map(o => ({
            date: o.date,
            campaignName: o.campaignName,
            depth: o.depth,
            length: o.length,
            circumferentialPosition: o.circumferentialPosition,
          }))
        : [{
            date: pi.latestObservedDate ? new Date(pi.latestObservedDate) : new Date(),
            campaignName: 'Current',
            depth: pi.currentDepth ?? 4.0,
            length: pi.currentLength ?? 30.0,
            circumferentialPosition: pi.approximateLocation ?? 0,
          }];

      const pred = generateGrowthPrediction(measurements, {
        modelType: 'LINEAR',
        scenario: 'MODERATE',
        thresholds: { nominalWallThickness: nominalThickness },
      });

      const campaignHistory: FlawCampaignRecord[] = obsList.map(o => ({
        campaignName: o.campaignName,
        inspectionDate: o.date.toISOString().split('T')[0],
        length: o.length,
        depth: o.depth,
      }));

      const currentDepth = pred.currentDepth;
      const depthPercentOfWall = Number(((currentDepth / nominalThickness) * 100).toFixed(1));

      indicationItems.push({
        id: pi.id,
        code: pi.code,
        weldId: pi.weldJointId,
        weldName: weldMap.get(pi.weldJointId) || `Weld-${pi.weldJointId}`,
        circumferentialPosition: pi.approximateLocation ?? (obsList[0]?.circumferentialPosition || 0),
        segment: obsList[0]?.segment,
        currentLength: Number(pred.currentLength.toFixed(1)),
        currentDepth: Number(currentDepth.toFixed(2)),
        depthPercentOfWall,
        growthRateYear: pred.annualDepthRateMmYear,
        warningDate: pred.exceedance.warningDate ? pred.exceedance.warningDate.toISOString().split('T')[0] : null,
        warningDaysRemaining: pred.exceedance.warningDaysRemaining,
        criticalDate: pred.exceedance.criticalDate ? pred.exceedance.criticalDate.toISOString().split('T')[0] : null,
        criticalDaysRemaining: pred.exceedance.criticalDaysRemaining,
        riskTier: pred.exceedance.riskTier,
        campaignHistory,
      });
    }
  } else if (welds.length > 0) {
    // Fallback: Synthesize indications from inspection observations
    const weldIds = welds.map(w => w.id);
    const obsList = await db.select().from(inspectionObservations).where(inArray(inspectionObservations.weldJointId, weldIds));

    const grouped = new Map<string, typeof obsList>();
    for (const o of obsList) {
      const key = `${o.weldJointId}_${o.sourceIndicationNumber || `LOC_${Math.round(o.circumferentialPosition || 0)}`}`;
      const arr = grouped.get(key) || [];
      arr.push(o);
      grouped.set(key, arr);
    }

    let fakeId = 1;
    for (const [key, obsArr] of Array.from(grouped.entries())) {
      const sorted = obsArr.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const first = sorted[0];
      const latest = sorted[sorted.length - 1];

      const measurements: HistoricalMeasurement[] = sorted.map((o) => {
        const insp = inspMap.get(o.inspectionId);
        return {
          date: insp?.inspectionDate ? new Date(insp.inspectionDate) : new Date(o.createdAt),
          campaignName: insp?.campaignName || "Campaign",
          depth: o.depth,
          length: o.length,
          circumferentialPosition: o.circumferentialPosition ?? 0,
        };
      });

      const pred = generateGrowthPrediction(measurements, {
        modelType: 'LINEAR',
        scenario: 'MODERATE',
        thresholds: { nominalWallThickness: nominalThickness },
      });

      const currentDepth = pred.currentDepth;
      const depthPercentOfWall = Number(((currentDepth / nominalThickness) * 100).toFixed(1));

      const campaignHistory: FlawCampaignRecord[] = measurements.map(m => ({
        campaignName: m.campaignName || "Campaign",
        inspectionDate: m.date.toISOString().split('T')[0],
        length: m.length,
        depth: m.depth,
      }));

      indicationItems.push({
        id: fakeId++,
        code: `PI-${weldMap.get(first.weldJointId) || first.weldJointId}-${first.sourceIndicationNumber || fakeId}`,
        weldId: first.weldJointId,
        weldName: weldMap.get(first.weldJointId) || `Weld-${first.weldJointId}`,
        circumferentialPosition: Number((latest.circumferentialPosition ?? 0).toFixed(1)),
        currentLength: Number(pred.currentLength.toFixed(1)),
        currentDepth: Number(currentDepth.toFixed(2)),
        depthPercentOfWall,
        growthRateYear: pred.annualDepthRateMmYear,
        warningDate: pred.exceedance.warningDate ? pred.exceedance.warningDate.toISOString().split('T')[0] : null,
        warningDaysRemaining: pred.exceedance.warningDaysRemaining,
        criticalDate: pred.exceedance.criticalDate ? pred.exceedance.criticalDate.toISOString().split('T')[0] : null,
        criticalDaysRemaining: pred.exceedance.criticalDaysRemaining,
        riskTier: pred.exceedance.riskTier,
        campaignHistory,
      });
    }
  }

  // Filter by weld if requested
  const filteredIndications = weldId 
    ? indicationItems.filter(i => i.weldId === weldId)
    : indicationItems;

  // Sort by risk priority
  const riskOrder = { CRITICAL: 0, HIGH: 1, MODERATE: 2, LOW: 3 };
  filteredIndications.sort((a, b) => {
    if (riskOrder[a.riskTier] !== riskOrder[b.riskTier]) {
      return riskOrder[a.riskTier] - riskOrder[b.riskTier];
    }
    const daysA = a.warningDaysRemaining ?? 99999;
    const daysB = b.warningDaysRemaining ?? 99999;
    return daysA - daysB;
  });

  // Calculate Executive Summary
  const criticalCount = filteredIndications.filter(i => i.riskTier === 'CRITICAL').length;
  const highRiskCount = filteredIndications.filter(i => i.riskTier === 'HIGH').length;
  const moderateCount = filteredIndications.filter(i => i.riskTier === 'MODERATE').length;
  const lowRiskCount = filteredIndications.filter(i => i.riskTier === 'LOW').length;

  const validWarningDays = filteredIndications
    .map(i => i.warningDaysRemaining)
    .filter((d): d is number => d !== null && d >= 0)
    .sort((a, b) => a - b);

  const validThroughWallDays = filteredIndications
    .map(i => i.criticalDaysRemaining)
    .filter((d): d is number => d !== null && d >= 0)
    .sort((a, b) => a - b);

  const earliestWarningDays = validWarningDays.length > 0 ? validWarningDays[0] : null;
  const earliestThroughWallDays = validThroughWallDays.length > 0 ? validThroughWallDays[0] : null;

  const earliestWarningItem = filteredIndications.find(i => i.warningDaysRemaining === earliestWarningDays);
  const earliestThroughWallItem = filteredIndications.find(i => i.criticalDaysRemaining === earliestThroughWallDays);

  let recommendedTurnaroundDate: string | null = null;
  if (earliestWarningItem?.warningDate) {
    const d = new Date(earliestWarningItem.warningDate);
    d.setMonth(d.getMonth() - 6);
    recommendedTurnaroundDate = d.toISOString().split('T')[0];
  }

  return {
    vesselInfo: {
      id: activeDrum.id,
      name: activeDrum.name,
      nominalThickness,
      diameter,
      material: activeDrum.material || "SA-387 Gr. 11 Cl. 2 (1.25Cr-0.5Mo)",
      clientName,
      status: activeDrum.status || "active",
    },
    executiveSummary: {
      monitoredFlawsCount: filteredIndications.length,
      criticalCount,
      highRiskCount,
      moderateCount,
      lowRiskCount,
      earliestWarningDate: earliestWarningItem?.warningDate ?? null,
      earliestWarningDays,
      earliestThroughWallDate: earliestThroughWallItem?.criticalDate ?? null,
      earliestThroughWallDays,
      recommendedTurnaroundDate,
    },
    availableDrums: drumsList.map(d => ({ id: d.id, name: d.name })),
    availableWelds: welds.map(w => ({ id: w.id, name: w.name, drumId: w.drumId })),
    indications: filteredIndications,
    selectedWeldId: weldId ?? null,
    selectedIndicationId: filteredIndications[0]?.id ?? null,
    allCampaignNames,
  };
}
