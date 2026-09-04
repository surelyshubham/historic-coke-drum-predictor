export interface ObservationPoint {
  observationId: number;
  inspectionId: number;
  inspectionDate: Date;
  campaignName: string;
  weldName: string;
  circumferentialPosition: number;
  length: number;
  depth: number;
  indicationType: string;
}

export interface GrowthMetrics {
  previousLength: number;
  currentLength: number;
  lengthDelta: number; // mm
  lengthPercentChange: number; // %
  previousDepth: number;
  currentDepth: number;
  depthDelta: number; // mm
  depthPercentChange: number; // %
  daysInterval: number;
  yearsInterval: number;
  lengthGrowthRatePerYear: number; // mm/year
  depthGrowthRatePerYear: number; // mm/year
}

export interface PhysicalIndicationHistory {
  physicalIndicationId: number;
  code: string;
  weldName: string;
  status: string;
  observations: ObservationPoint[];
  growth: GrowthMetrics | null;
}

export function calculateGrowth(prev: ObservationPoint, curr: ObservationPoint): GrowthMetrics {
  const lengthDelta = curr.length - prev.length;
  const lengthPercentChange = prev.length > 0 ? (lengthDelta / prev.length) * 100 : 0;
  
  const depthDelta = curr.depth - prev.depth;
  const depthPercentChange = prev.depth > 0 ? (depthDelta / prev.depth) * 100 : 0;

  const msPerDay = 1000 * 60 * 60 * 24;
  const daysInterval = Math.max(1, Math.round((curr.inspectionDate.getTime() - prev.inspectionDate.getTime()) / msPerDay));
  const yearsInterval = daysInterval / 365.25;

  const lengthGrowthRatePerYear = yearsInterval > 0 ? lengthDelta / yearsInterval : 0;
  const depthGrowthRatePerYear = yearsInterval > 0 ? depthDelta / yearsInterval : 0;

  return {
    previousLength: prev.length,
    currentLength: curr.length,
    lengthDelta,
    lengthPercentChange,
    previousDepth: prev.depth,
    currentDepth: curr.depth,
    depthDelta,
    depthPercentChange,
    daysInterval,
    yearsInterval,
    lengthGrowthRatePerYear,
    depthGrowthRatePerYear,
  };
}

export function computeIndicationHistories(
  rawMatches: Array<{
    physicalIndicationId: number;
    code: string;
    weldName: string;
    status: string;
    observationId: number;
    inspectionId: number;
    inspectionDate: Date;
    campaignName: string;
    circumferentialPosition: number;
    length: number;
    depth: number;
    indicationType: string;
  }>
): PhysicalIndicationHistory[] {
  const map = new Map<number, PhysicalIndicationHistory>();

  rawMatches.forEach((row) => {
    if (!map.has(row.physicalIndicationId)) {
      map.set(row.physicalIndicationId, {
        physicalIndicationId: row.physicalIndicationId,
        code: row.code,
        weldName: row.weldName,
        status: row.status,
        observations: [],
        growth: null,
      });
    }

    const item = map.get(row.physicalIndicationId)!;
    item.observations.push({
      observationId: row.observationId,
      inspectionId: row.inspectionId,
      inspectionDate: new Date(row.inspectionDate),
      campaignName: row.campaignName,
      weldName: row.weldName,
      circumferentialPosition: row.circumferentialPosition,
      length: row.length,
      depth: row.depth,
      indicationType: row.indicationType,
    });
  });

  // Sort observations chronologically and calculate growth
  map.forEach((item) => {
    item.observations.sort((a, b) => a.inspectionDate.getTime() - b.inspectionDate.getTime());
    if (item.observations.length >= 2) {
      const prev = item.observations[item.observations.length - 2];
      const curr = item.observations[item.observations.length - 1];
      item.growth = calculateGrowth(prev, curr);
    }
  });

  return Array.from(map.values());
}
