export interface RepairZone {
  id: string;
  weldName: string;
  drumName?: string;
  startMm: number;
  endMm: number;
  repairDate?: string;
  campaignKey?: string;
  description?: string;
  restoredThicknessMm?: number;
}

export interface DisappearedFlawAnomaly {
  indicationCode: string;
  weldName: string;
  drumName: string;
  approximateLocationMm: number;
  detectedLengthMm: number;
  lastObservedCampaign: string;
  lastObservedDate?: string;
  missingInCampaign: string;
  suggestedStartMm: number;
  suggestedEndMm: number;
}
