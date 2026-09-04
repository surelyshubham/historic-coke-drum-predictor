export interface VesselInfo {
  id: number;
  name: string;
  nominalThickness: number;
  diameter: number;
  material: string;
  clientName: string;
  status: string;
}

export interface ExecutiveSummary {
  monitoredFlawsCount: number;
  criticalCount: number;
  highRiskCount: number;
  moderateCount: number;
  lowRiskCount: number;
  earliestWarningDate: string | null;
  earliestWarningDays: number | null;
  earliestThroughWallDate: string | null;
  earliestThroughWallDays: number | null;
  recommendedTurnaroundDate: string | null;
}

export interface FlawCampaignRecord {
  campaignName: string;
  inspectionDate: string;
  length: number;
  depth: number;
}

export interface ReportIndicationItem {
  id: number;
  code: string;
  weldId: number;
  weldName: string;
  circumferentialPosition: number;
  segment?: string;
  weldPosition?: string;
  currentLength: number;
  currentDepth: number;
  depthPercentOfWall: number;
  growthRateYear: number;
  warningDate: string | null;
  warningDaysRemaining: number | null;
  criticalDate: string | null;
  criticalDaysRemaining: number | null;
  riskTier: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW';
  campaignHistory: FlawCampaignRecord[];
}

export interface ReportImages {
  polarRingImage?: string;
  weldPlanImage?: string;
  bevelSScanImage?: string;
  forecastCurveImage?: string;
}

export interface ReportPayload {
  vesselInfo: VesselInfo;
  executiveSummary: ExecutiveSummary;
  availableDrums: Array<{ id: number; name: string }>;
  availableWelds: Array<{ id: number; name: string; drumId: number }>;
  indications: ReportIndicationItem[];
  selectedWeldId: number | null;
  selectedIndicationId: number | null;
  allCampaignNames: string[];
  images?: ReportImages;
}

export interface ReportSectionConfig {
  executiveSummary: boolean;
  polarRingMap: boolean;
  weldWidthPlan: boolean;
  bevelSScan: boolean;
  predictiveForecast: boolean;
  progressionTable: boolean;
}

