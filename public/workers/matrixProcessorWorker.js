// WebWorker for off-thread PAUT Matrix processing, filtering, and report compilation

self.onmessage = function (e) {
  const { id, action, payload } = e.data;

  try {
    switch (action) {
      case "PING":
        self.postMessage({ id, success: true, result: "PONG" });
        break;

      case "COMPILE_REPORT_PAYLOAD": {
        const result = compileReportPayload(payload);
        self.postMessage({ id, success: true, result });
        break;
      }

      case "FILTER_INDICATIONS": {
        const result = filterIndications(payload);
        self.postMessage({ id, success: true, result });
        break;
      }

      default:
        self.postMessage({ id, success: false, error: `Unknown worker action: ${action}` });
    }
  } catch (err) {
    self.postMessage({ id, success: false, error: err.message || String(err) });
  }
};

/**
 * Filter physical indications by drums and welds in the worker
 */
function filterIndications({ matrixResult, selectedTanks, selectedWelds }) {
  if (!matrixResult || !matrixResult.physicalIndications) return [];

  return matrixResult.physicalIndications.filter((pi) => {
    const tankMatch =
      !selectedTanks ||
      selectedTanks.length === 0 ||
      selectedTanks.includes("ALL") ||
      selectedTanks.includes(pi.drumName);
    const weldMatch =
      !selectedWelds ||
      selectedWelds.length === 0 ||
      selectedWelds.includes("ALL") ||
      selectedWelds.includes(pi.weldName);
    return tankMatch && weldMatch;
  });
}

/**
 * Compute growth and threshold exceedance for an indication
 */
function calculateIndicationLifing(measurements, nominalThickness, latestDepth, latestLength) {
  const currentDepth = latestDepth || 3.0;
  const currentLength = latestLength || 30.0;
  let annualRate = 0.5; // default fallback

  if (measurements && measurements.length >= 2) {
    const sorted = measurements.slice().sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const deltaMs = new Date(last.date).getTime() - new Date(first.date).getTime();
    const deltaYears = deltaMs / (1000 * 60 * 60 * 24 * 365.25);

    if (deltaYears > 0.05) {
      const deltaDepth = Math.max(0, last.depth - first.depth);
      annualRate = Math.round((deltaDepth / deltaYears) * 100) / 100;
      if (annualRate <= 0.01) annualRate = 0.2;
    }
  }

  const pct = (currentDepth / nominalThickness) * 100;
  const warningThresh = nominalThickness * 0.8;
  const criticalThresh = nominalThickness * 0.9;

  let riskTier = "LOW";
  if (pct >= 90) riskTier = "CRITICAL";
  else if (pct >= 80) riskTier = "HIGH";
  else if (pct >= 50) riskTier = "MODERATE";

  const now = new Date();
  let warningDaysRemaining = null;
  let warningDate = null;
  let criticalDaysRemaining = null;
  let criticalDate = null;

  if (annualRate > 0) {
    if (currentDepth < warningThresh) {
      const yearsToWarn = (warningThresh - currentDepth) / annualRate;
      warningDaysRemaining = Math.max(0, Math.round(yearsToWarn * 365.25));
      const wDate = new Date(now.getTime() + warningDaysRemaining * 24 * 60 * 60 * 1000);
      warningDate = wDate.toISOString().split("T")[0];
    } else {
      warningDaysRemaining = 0;
      warningDate = now.toISOString().split("T")[0];
    }

    if (currentDepth < criticalThresh) {
      const yearsToCrit = (criticalThresh - currentDepth) / annualRate;
      criticalDaysRemaining = Math.max(0, Math.round(yearsToCrit * 365.25));
      const cDate = new Date(now.getTime() + criticalDaysRemaining * 24 * 60 * 60 * 1000);
      criticalDate = cDate.toISOString().split("T")[0];
    } else {
      criticalDaysRemaining = 0;
      criticalDate = now.toISOString().split("T")[0];
    }
  }

  return {
    currentDepth,
    currentLength,
    annualDepthRateMmYear: annualRate,
    warningDate,
    warningDaysRemaining,
    criticalDate,
    criticalDaysRemaining,
    riskTier,
  };
}

/**
 * Compile a complete ReportPayload from a parsed matrix structure
 */
function compileReportPayload({
  matrix,
  targetDrumName,
  targetWeldName,
  customNominalThickness,
  customDiameter,
}) {
  if (!matrix || !matrix.physicalIndications) {
    throw new Error("Invalid matrix dataset provided to worker.");
  }

  const availableDrums = matrix.availableDrums.map((name, idx) => ({
    id: idx + 1,
    name,
  }));

  const activeDrumName =
    targetDrumName && matrix.availableDrums.includes(targetDrumName)
      ? targetDrumName
      : matrix.availableDrums[0] || "Coke Drum";

  const activeDrumObj = availableDrums.find((d) => d.name === activeDrumName) || availableDrums[0] || { id: 1, name: activeDrumName };

  const nominalThickness =
    customNominalThickness && customNominalThickness > 0 ? customNominalThickness : 32.0;
  const diameter = customDiameter && customDiameter > 0 ? customDiameter : 8.97;

  const vesselInfo = {
    id: activeDrumObj.id,
    name: activeDrumName,
    nominalThickness,
    diameter,
    material: "SA-387 Gr. 11 Cl. 2 (1.25Cr-0.5Mo) + 410S Clad",
    clientName: "Refinery Operations",
    status: "active",
  };

  const weldNamesForActiveDrum =
    matrix.weldsByDrum && matrix.weldsByDrum[activeDrumName]
      ? matrix.weldsByDrum[activeDrumName]
      : matrix.availableWelds;

  const availableWelds = weldNamesForActiveDrum.map((name, idx) => ({
    id: idx + 1,
    drumId: activeDrumObj.id,
    name,
  }));

  // Filter indications for this drum
  let matchingIndications = matrix.physicalIndications.filter((pi) => pi.drumName === activeDrumName);
  if (targetWeldName && targetWeldName !== "ALL") {
    matchingIndications = matchingIndications.filter((pi) => pi.weldName === targetWeldName);
  }

  const allCampaignNames = matrix.campaigns.map((c) => c.key);

  const indicationItems = matchingIndications.map((pi, idx) => {
    const measurements = [];
    const campaignHistory = [];

    matrix.campaigns.forEach((c) => {
      const val = pi.campaignValues ? pi.campaignValues[c.key] : null;
      if (val && val.length !== null && val.depth !== null) {
        measurements.push({
          date: c.date,
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
          depthOd: val.depthOd ?? null,
          depthId: val.depthId ?? null,
        });
      }
    });

    const lifing = calculateIndicationLifing(
      measurements,
      nominalThickness,
      pi.latestDepth,
      pi.latestLength
    );

    const depthPercentOfWall = Number(((lifing.currentDepth / nominalThickness) * 100).toFixed(1));

    return {
      id: idx + 1,
      code: pi.code,
      weldId: idx + 1,
      weldName: pi.weldName,
      circumferentialPosition: pi.circumferentialPosition,
      segment: pi.segment,
      weldPosition: pi.weldPosition,
      currentLength: Number(lifing.currentLength.toFixed(1)),
      currentDepth: Number(lifing.currentDepth.toFixed(2)),
      currentDepthOd: pi.latestDepthOd ?? null,
      currentDepthId: pi.latestDepthId ?? null,
      cladStatus: pi.cladStatus ?? "INCLUDING",
      offsetMm: pi.offsetMm ?? 0,
      toeType: pi.toeType ?? "CENTER",
      accumulatedHeight: pi.accumulatedHeight ?? null,
      depthPercentOfWall,
      growthRateYear: lifing.annualDepthRateMmYear,
      warningDate: lifing.warningDate,
      warningDaysRemaining: lifing.warningDaysRemaining,
      criticalDate: lifing.criticalDate,
      criticalDaysRemaining: lifing.criticalDaysRemaining,
      riskTier: lifing.riskTier,
      campaignHistory,
    };
  });

  // Sort by risk tier priority
  const riskOrder = { CRITICAL: 0, HIGH: 1, MODERATE: 2, LOW: 3 };
  indicationItems.sort((a, b) => {
    if (riskOrder[a.riskTier] !== riskOrder[b.riskTier]) {
      return riskOrder[a.riskTier] - riskOrder[b.riskTier];
    }
    const daysA = a.warningDaysRemaining ?? 99999;
    const daysB = b.warningDaysRemaining ?? 99999;
    return daysA - daysB;
  });

  const criticalCount = indicationItems.filter((i) => i.riskTier === "CRITICAL").length;
  const highRiskCount = indicationItems.filter((i) => i.riskTier === "HIGH").length;
  const moderateCount = indicationItems.filter((i) => i.riskTier === "MODERATE").length;
  const lowRiskCount = indicationItems.filter((i) => i.riskTier === "LOW").length;

  const validWarningDays = indicationItems
    .map((i) => i.warningDaysRemaining)
    .filter((d) => d !== null && d !== undefined);
  const minWarningDays = validWarningDays.length > 0 ? Math.min(...validWarningDays) : null;

  const validThroughWallDays = indicationItems
    .map((i) => i.criticalDaysRemaining)
    .filter((d) => d !== null && d !== undefined);
  const minThroughWallDays = validThroughWallDays.length > 0 ? Math.min(...validThroughWallDays) : null;

  let earliestWarningDate = null;
  if (minWarningDays !== null) {
    const d = new Date();
    d.setDate(d.getDate() + minWarningDays);
    earliestWarningDate = d.toISOString().split("T")[0];
  }

  let earliestThroughWallDate = null;
  if (minThroughWallDays !== null) {
    const d = new Date();
    d.setDate(d.getDate() + minThroughWallDays);
    earliestThroughWallDate = d.toISOString().split("T")[0];
  }

  let recommendedTurnaroundDate = null;
  if (minWarningDays !== null) {
    const turnaroundLeadDays = Math.max(30, minWarningDays - 60);
    const d = new Date();
    d.setDate(d.getDate() + turnaroundLeadDays);
    recommendedTurnaroundDate = d.toISOString().split("T")[0];
  }

  const executiveSummary = {
    monitoredFlawsCount: indicationItems.length,
    criticalCount,
    highRiskCount,
    moderateCount,
    lowRiskCount,
    earliestWarningDate,
    earliestWarningDays: minWarningDays,
    earliestThroughWallDate,
    earliestThroughWallDays: minThroughWallDays,
    recommendedTurnaroundDate,
  };

  return {
    vesselInfo,
    executiveSummary,
    indications: indicationItems,
    availableDrums,
    availableWelds,
    selectedWeldId: targetWeldName && targetWeldName !== "ALL"
      ? availableWelds.find((w) => w.name === targetWeldName)?.id
      : undefined,
    allCampaignNames,
    matrixRawResult: matrix,
  };
}