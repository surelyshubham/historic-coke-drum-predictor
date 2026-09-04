/**
 * Growth & Predictive Modeling Engine for Coke Drum PAUT Indications
 *
 * Implements transparent, deterministic engineering mathematics:
 * 1. Ordinary Least Squares (OLS) Linear Regression: L(t) = L0 + r * t
 * 2. Exponential Acceleration Model: L(t) = L0 * exp(k * t)
 * 3. Multi-scenario growth projections (Conservative, Moderate, Optimistic)
 * 4. Confidence interval / uncertainty fan-out bounds
 * 5. Critical wall thickness and length threshold exceedance date calculators
 */

export interface HistoricalMeasurement {
  date: Date;
  campaignName: string;
  depth: number; // mm
  length: number; // mm
  circumferentialPosition?: number;
}

export type PredictionModelType = 'LINEAR' | 'EXPONENTIAL';
export type ScenarioType = 'CONSERVATIVE' | 'MODERATE' | 'OPTIMISTIC';

export interface ModelFitParameters {
  modelType: PredictionModelType;
  // Linear: y(t) = intercept + slope * t
  // Exponential: y(t) = intercept * exp(rate * t)
  depthSlope: number; // mm/year (or exponential k)
  depthIntercept: number; // mm at t=0
  depthR2: number; // coefficient of determination [0, 1]
  depthStdError: number; // standard error of estimate

  lengthSlope: number; // mm/year (or exponential k)
  lengthIntercept: number; // mm at t=0
  lengthR2: number;
  lengthStdError: number;
}

export interface ThresholdConfig {
  nominalWallThickness: number; // default 32.0 mm
  warningThresholdPercent: number; // default 80%
  criticalThresholdPercent: number; // default 100%
  criticalLengthLimit: number; // default 500 mm
}

export interface ThresholdExceedanceResult {
  warningDepthMm: number;
  warningDate: Date | null;
  warningDaysRemaining: number | null;

  criticalDepthMm: number;
  criticalDate: Date | null;
  criticalDaysRemaining: number | null;

  criticalLengthMm: number;
  lengthExceedDate: Date | null;
  lengthDaysRemaining: number | null;

  recommendedTurnaroundDate: Date | null;
  riskTier: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW';
}

export interface ForecastPoint {
  date: string; // ISO date string YYYY-MM-DD
  timestamp: number;
  yearsFromBaseline: number;
  depth: number;
  depthLower: number;
  depthUpper: number;
  length: number;
  lengthLower: number;
  lengthUpper: number;
  isHistorical: boolean;
  campaignName?: string;
}

export interface PredictionResult {
  modelType: PredictionModelType;
  scenario: ScenarioType;
  fitParams: ModelFitParameters;
  thresholds: ThresholdConfig;
  exceedance: ThresholdExceedanceResult;
  timeSeries: ForecastPoint[];
  currentDepth: number;
  currentLength: number;
  annualDepthRateMmYear: number;
  annualLengthRateMmYear: number;
}

/**
 * Fits Ordinary Least Squares (OLS) Linear Regression: y = a + b * x
 */
export function fitLinearOLS(x: number[], y: number[]): { slope: number; intercept: number; r2: number; stdError: number } {
  const n = x.length;
  if (n === 0) return { slope: 0, intercept: 0, r2: 1, stdError: 0 };
  if (n === 1) return { slope: 0, intercept: y[0], r2: 1, stdError: 0 };

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i];
  }

  const denom = n * sumX2 - sumX * sumX;
  if (Math.abs(denom) < 1e-12) {
    return { slope: 0, intercept: sumY / n, r2: 1, stdError: 0 };
  }

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  // Compute R2 and Standard Error
  const meanY = sumY / n;
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const pred = intercept + slope * x[i];
    ssRes += Math.pow(y[i] - pred, 2);
    ssTot += Math.pow(y[i] - meanY, 2);
  }

  const r2 = ssTot > 1e-9 ? Math.max(0, Math.min(1, 1 - ssRes / ssTot)) : 1;
  const df = Math.max(1, n - 2);
  const stdError = Math.sqrt(ssRes / df);

  return { slope, intercept, r2, stdError };
}

/**
 * Fits Exponential Growth Model: y = a * exp(k * x) => ln(y) = ln(a) + k * x
 */
export function fitExponential(x: number[], y: number[]): { rate: number; intercept: number; r2: number; stdError: number } {
  const n = x.length;
  if (n === 0) return { rate: 0, intercept: 1, r2: 1, stdError: 0 };
  if (n === 1) return { rate: 0, intercept: Math.max(0.1, y[0]), r2: 1, stdError: 0 };

  // Convert positive y to log space
  const logY = y.map(v => Math.log(Math.max(0.01, v)));
  const lin = fitLinearOLS(x, logY);

  const rate = Math.max(-0.5, Math.min(2.0, lin.slope)); // Clamp rate to physically realistic bounds
  const intercept = Math.exp(lin.intercept);

  // Compute R2 against actual y
  const meanY = y.reduce((acc, v) => acc + v, 0) / n;
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const pred = intercept * Math.exp(rate * x[i]);
    ssRes += Math.pow(y[i] - pred, 2);
    ssTot += Math.pow(y[i] - meanY, 2);
  }

  const r2 = ssTot > 1e-9 ? Math.max(0, Math.min(1, 1 - ssRes / ssTot)) : 1;
  const df = Math.max(1, n - 2);
  const stdError = Math.sqrt(ssRes / df);

  return { rate, intercept, r2, stdError };
}

/**
 * Main function to generate multi-scenario predictions, threshold dates, and time series.
 */
export function generateGrowthPrediction(
  measurements: HistoricalMeasurement[],
  options?: {
    modelType?: PredictionModelType;
    scenario?: ScenarioType;
    thresholds?: Partial<ThresholdConfig>;
    forecastYears?: number; // default 5 years
    stepMonths?: number; // default 3 months
  }
): PredictionResult {
  const modelType = options?.modelType ?? 'LINEAR';
  const scenario = options?.scenario ?? 'MODERATE';
  const forecastYears = options?.forecastYears ?? 5;
  const stepMonths = options?.stepMonths ?? 3;

  const thresholds: ThresholdConfig = {
    nominalWallThickness: options?.thresholds?.nominalWallThickness ?? 32.0,
    warningThresholdPercent: options?.thresholds?.warningThresholdPercent ?? 80.0,
    criticalThresholdPercent: options?.thresholds?.criticalThresholdPercent ?? 100.0,
    criticalLengthLimit: options?.thresholds?.criticalLengthLimit ?? 500.0,
  };

  // Sort chronological
  const sorted = [...measurements].sort((a, b) => a.date.getTime() - b.date.getTime());

  if (sorted.length === 0) {
    throw new Error('At least one measurement is required to generate a forecast.');
  }

  const baseDate = sorted[0].date;
  const latestDate = sorted[sorted.length - 1].date;
  const msPerYear = 1000 * 60 * 60 * 24 * 365.25;

  const timeYears = sorted.map(m => (m.date.getTime() - baseDate.getTime()) / msPerYear);
  const depths = sorted.map(m => m.depth);
  const lengths = sorted.map(m => m.length);

  // Linear Fits
  const linDepth = fitLinearOLS(timeYears, depths);
  const linLength = fitLinearOLS(timeYears, lengths);

  // Exponential Fits
  const expDepth = fitExponential(timeYears, depths);
  const expLength = fitExponential(timeYears, lengths);

  const fitParams: ModelFitParameters = {
    modelType,
    depthSlope: modelType === 'LINEAR' ? linDepth.slope : expDepth.rate,
    depthIntercept: modelType === 'LINEAR' ? linDepth.intercept : expDepth.intercept,
    depthR2: modelType === 'LINEAR' ? linDepth.r2 : expDepth.r2,
    depthStdError: modelType === 'LINEAR' ? linDepth.stdError : expDepth.stdError,

    lengthSlope: modelType === 'LINEAR' ? linLength.slope : expLength.rate,
    lengthIntercept: modelType === 'LINEAR' ? linLength.intercept : expLength.intercept,
    lengthR2: modelType === 'LINEAR' ? linLength.r2 : expLength.r2,
    lengthStdError: modelType === 'LINEAR' ? linLength.stdError : expLength.stdError,
  };

  // Determine scenario multipliers / adjustments
  let depthRateMultiplier = 1.0;
  let lengthRateMultiplier = 1.0;
  let confidenceZ = 1.0; // Moderate: 1 sigma fan-out

  if (scenario === 'CONSERVATIVE') {
    depthRateMultiplier = 1.35; // 35% conservative buffer
    lengthRateMultiplier = 1.35;
    confidenceZ = 1.96; // 95% confidence bounds
  } else if (scenario === 'OPTIMISTIC') {
    depthRateMultiplier = 0.7; // 30% lower rate
    lengthRateMultiplier = 0.7;
    confidenceZ = 0.67; // tighter bound
  }

  const latestDepth = sorted[sorted.length - 1].depth;
  const latestLength = sorted[sorted.length - 1].length;
  const latestTimeYears = (latestDate.getTime() - baseDate.getTime()) / msPerYear;

  // Predict function for given t (years from baseline)
  const predictAtTime = (t: number) => {
    let predDepth = 0;
    let predLength = 0;

    if (sorted.length === 1) {
      // Single observation point: use industry standard nominal growth rate (0.8 mm/yr depth, 8 mm/yr length)
      const dt = t - latestTimeYears;
      const baseDepthRate = 0.8 * depthRateMultiplier;
      const baseLengthRate = 8.0 * lengthRateMultiplier;
      predDepth = latestDepth + Math.max(0, dt) * baseDepthRate;
      predLength = latestLength + Math.max(0, dt) * baseLengthRate;
    } else if (modelType === 'LINEAR') {
      const nominalDepthRate = Math.max(0, linDepth.slope) * depthRateMultiplier;
      const nominalLengthRate = Math.max(0, linLength.slope) * lengthRateMultiplier;
      const dt = t - latestTimeYears;
      if (dt <= 0) {
        predDepth = linDepth.intercept + linDepth.slope * t;
        predLength = linLength.intercept + linLength.slope * t;
      } else {
        predDepth = latestDepth + nominalDepthRate * dt;
        predLength = latestLength + nominalLengthRate * dt;
      }
    } else {
      // Exponential
      const nominalExpRate = Math.max(0, expDepth.rate) * depthRateMultiplier;
      const nominalLenExpRate = Math.max(0, expLength.rate) * lengthRateMultiplier;
      const dt = t - latestTimeYears;
      if (dt <= 0) {
        predDepth = expDepth.intercept * Math.exp(expDepth.rate * t);
        predLength = expLength.intercept * Math.exp(expLength.rate * t);
      } else {
        predDepth = latestDepth * Math.exp(nominalExpRate * dt);
        predLength = latestLength * Math.exp(nominalLenExpRate * dt);
      }
    }

    // Standard error fan-out expands with sqrt(1 + dt)
    const dtForward = Math.max(0, t - latestTimeYears);
    const fanOutFactor = Math.sqrt(1 + dtForward * 1.5);
    const depthUncertainty = (fitParams.depthStdError || 0.5) * confidenceZ * fanOutFactor;
    const lengthUncertainty = (fitParams.lengthStdError || 2.0) * confidenceZ * fanOutFactor;

    return {
      depth: Math.max(0, predDepth),
      depthLower: Math.max(0, predDepth - depthUncertainty),
      depthUpper: predDepth + depthUncertainty,
      length: Math.max(0, predLength),
      lengthLower: Math.max(0, predLength - lengthUncertainty),
      lengthUpper: predLength + lengthUncertainty,
    };
  };

  // Compute annual rates
  const sampleT1 = latestTimeYears + 1.0;
  const pLatest = predictAtTime(latestTimeYears);
  const p1Year = predictAtTime(sampleT1);
  const annualDepthRateMmYear = Math.max(0, Number((p1Year.depth - pLatest.depth).toFixed(2)));
  const annualLengthRateMmYear = Math.max(0, Number((p1Year.length - pLatest.length).toFixed(2)));

  // Thresholds values in mm
  const warningDepthMm = (thresholds.nominalWallThickness * thresholds.warningThresholdPercent) / 100.0;
  const criticalDepthMm = (thresholds.nominalWallThickness * thresholds.criticalThresholdPercent) / 100.0;
  const criticalLengthMm = thresholds.criticalLengthLimit;

  // Calculate Exceedance Dates
  let warningDate: Date | null = null;
  let warningDaysRemaining: number | null = null;
  let criticalDate: Date | null = null;
  let criticalDaysRemaining: number | null = null;
  let lengthExceedDate: Date | null = null;
  let lengthDaysRemaining: number | null = null;

  const msPerDay = 1000 * 60 * 60 * 24;

  // Iterative forward search for threshold crossings up to 15 years
  const maxSearchYears = 15;
  const searchStepDays = 15;
  const now = new Date();

  for (let d = 0; d <= maxSearchYears * 365; d += searchStepDays) {
    const testDate = new Date(latestDate.getTime() + d * msPerDay);
    const t = (testDate.getTime() - baseDate.getTime()) / msPerYear;
    const p = predictAtTime(t);

    if (!warningDate && p.depth >= warningDepthMm) {
      warningDate = testDate;
      warningDaysRemaining = Math.max(0, Math.round((testDate.getTime() - now.getTime()) / msPerDay));
    }
    if (!criticalDate && p.depth >= criticalDepthMm) {
      criticalDate = testDate;
      criticalDaysRemaining = Math.max(0, Math.round((testDate.getTime() - now.getTime()) / msPerDay));
    }
    if (!lengthExceedDate && p.length >= criticalLengthMm) {
      lengthExceedDate = testDate;
      lengthDaysRemaining = Math.max(0, Math.round((testDate.getTime() - now.getTime()) / msPerDay));
    }

    if (warningDate && criticalDate && lengthExceedDate) break;
  }

  // Determine Risk Tier
  let riskTier: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW' = 'LOW';
  if (latestDepth >= warningDepthMm || (warningDaysRemaining !== null && warningDaysRemaining <= 365)) {
    riskTier = 'CRITICAL';
  } else if (warningDaysRemaining !== null && warningDaysRemaining <= 730) {
    riskTier = 'HIGH';
  } else if (warningDaysRemaining !== null && warningDaysRemaining <= 1460) {
    riskTier = 'MODERATE';
  }

  // Recommended Turnaround Date (typically 6 months before warning threshold date, or next 2-year window)
  let recommendedTurnaroundDate: Date | null = null;
  if (warningDate) {
    const taMs = warningDate.getTime() - 180 * msPerDay; // 6 months prior
    recommendedTurnaroundDate = new Date(Math.max(now.getTime() + 60 * msPerDay, taMs));
  } else {
    // Default scheduled turnaround in 3 years
    recommendedTurnaroundDate = new Date(latestDate.getTime() + 3 * 365 * msPerDay);
  }

  // Generate Time Series for Charting
  const timeSeries: ForecastPoint[] = [];

  // Add historical points
  for (const h of sorted) {
    const t = (h.date.getTime() - baseDate.getTime()) / msPerYear;
    timeSeries.push({
      date: h.date.toISOString().split('T')[0],
      timestamp: h.date.getTime(),
      yearsFromBaseline: Number(t.toFixed(2)),
      depth: h.depth,
      depthLower: h.depth,
      depthUpper: h.depth,
      length: h.length,
      lengthLower: h.length,
      lengthUpper: h.length,
      isHistorical: true,
      campaignName: h.campaignName,
    });
  }

  // Add forward forecast points
  const totalMonths = forecastYears * 12;
  for (let m = stepMonths; m <= totalMonths; m += stepMonths) {
    const futureDate = new Date(latestDate.getTime() + (m / 12) * msPerYear);
    const t = (futureDate.getTime() - baseDate.getTime()) / msPerYear;
    const pred = predictAtTime(t);

    timeSeries.push({
      date: futureDate.toISOString().split('T')[0],
      timestamp: futureDate.getTime(),
      yearsFromBaseline: Number(t.toFixed(2)),
      depth: Number(pred.depth.toFixed(2)),
      depthLower: Number(pred.depthLower.toFixed(2)),
      depthUpper: Number(pred.depthUpper.toFixed(2)),
      length: Number(pred.length.toFixed(1)),
      lengthLower: Number(pred.lengthLower.toFixed(1)),
      lengthUpper: Number(pred.lengthUpper.toFixed(1)),
      isHistorical: false,
    });
  }

  return {
    modelType,
    scenario,
    fitParams,
    thresholds,
    exceedance: {
      warningDepthMm: Number(warningDepthMm.toFixed(2)),
      warningDate,
      warningDaysRemaining,
      criticalDepthMm: Number(criticalDepthMm.toFixed(2)),
      criticalDate,
      criticalDaysRemaining,
      criticalLengthMm,
      lengthExceedDate,
      lengthDaysRemaining,
      recommendedTurnaroundDate,
      riskTier,
    },
    timeSeries,
    currentDepth: latestDepth,
    currentLength: latestLength,
    annualDepthRateMmYear,
    annualLengthRateMmYear,
  };
}
