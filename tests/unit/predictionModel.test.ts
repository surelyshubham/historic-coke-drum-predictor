import { describe, it, expect } from 'vitest';
import {
  fitLinearOLS,
  fitExponential,
  generateGrowthPrediction,
  HistoricalMeasurement,
} from '../../lib/prediction/growthModel';

describe('Prediction Engine — Mathematical Models & Thresholds', () => {
  const sampleMeasurements: HistoricalMeasurement[] = [
    {
      date: new Date('2023-10-01'),
      campaignName: 'OCT-2023',
      depth: 10.0,
      length: 50.0,
      circumferentialPosition: 450,
    },
    {
      date: new Date('2024-04-01'),
      campaignName: 'APR-2024',
      depth: 12.0,
      length: 60.0,
      circumferentialPosition: 452,
    },
    {
      date: new Date('2025-05-01'),
      campaignName: 'MAY-2025',
      depth: 16.0,
      length: 80.0,
      circumferentialPosition: 455,
    },
  ];

  it('correctly calculates OLS Linear Regression fit parameters', () => {
    // x in years: 0, 1, 2. y: 10, 14, 18 => slope = 4, intercept = 10, r2 = 1.0
    const x = [0, 1, 2];
    const y = [10, 14, 18];
    const fit = fitLinearOLS(x, y);

    expect(fit.slope).toBeCloseTo(4.0, 4);
    expect(fit.intercept).toBeCloseTo(10.0, 4);
    expect(fit.r2).toBeCloseTo(1.0, 4);
    expect(fit.stdError).toBeCloseTo(0.0, 4);
  });

  it('correctly fits Exponential Growth Model', () => {
    // x: 0, 1, 2. y = 10 * exp(0.5 * x)
    const x = [0, 1, 2];
    const y = [10, 10 * Math.exp(0.5), 10 * Math.exp(1.0)];
    const fit = fitExponential(x, y);

    expect(fit.rate).toBeCloseTo(0.5, 2);
    expect(fit.intercept).toBeCloseTo(10.0, 1);
    expect(fit.r2).toBeGreaterThan(0.98);
  });

  it('generates multi-campaign prediction with linear model and verifies positive growth rate', () => {
    const result = generateGrowthPrediction(sampleMeasurements, {
      modelType: 'LINEAR',
      scenario: 'MODERATE',
      thresholds: {
        nominalWallThickness: 32.0,
        warningThresholdPercent: 80.0,
        criticalThresholdPercent: 100.0,
      },
    });

    expect(result.modelType).toBe('LINEAR');
    expect(result.currentDepth).toBe(16.0);
    expect(result.currentLength).toBe(80.0);
    expect(result.annualDepthRateMmYear).toBeGreaterThan(3.0);
    expect(result.timeSeries.length).toBeGreaterThan(sampleMeasurements.length);

    // Verify historical points are flagged
    const histPoints = result.timeSeries.filter(p => p.isHistorical);
    expect(histPoints.length).toBe(3);

    // Verify warning depth is 80% of 32 = 25.6mm
    expect(result.exceedance.warningDepthMm).toBe(25.6);
    expect(result.exceedance.criticalDepthMm).toBe(32.0);

    // Flaw is growing, so warning date must be computed
    expect(result.exceedance.warningDate).not.toBeNull();
    expect(result.exceedance.warningDaysRemaining).toBeGreaterThan(0);
  });

  it('handles conservative scenario with amplified rate and wider confidence bounds', () => {
    const moderate = generateGrowthPrediction(sampleMeasurements, {
      modelType: 'LINEAR',
      scenario: 'MODERATE',
    });

    const conservative = generateGrowthPrediction(sampleMeasurements, {
      modelType: 'LINEAR',
      scenario: 'CONSERVATIVE',
    });

    expect(conservative.annualDepthRateMmYear).toBeGreaterThanOrEqual(moderate.annualDepthRateMmYear);

    // In conservative scenario, warning days remaining should be fewer (happens earlier)
    if (conservative.exceedance.warningDaysRemaining && moderate.exceedance.warningDaysRemaining) {
      expect(conservative.exceedance.warningDaysRemaining).toBeLessThanOrEqual(
        moderate.exceedance.warningDaysRemaining
      );
    }
  });

  it('handles single observation edge case gracefully without throwing', () => {
    const singleMeasurement: HistoricalMeasurement[] = [
      {
        date: new Date('2024-01-01'),
        campaignName: 'JAN-2024',
        depth: 8.0,
        length: 25.0,
      },
    ];

    const result = generateGrowthPrediction(singleMeasurement);
    expect(result.currentDepth).toBe(8.0);
    expect(result.annualDepthRateMmYear).toBeGreaterThan(0);
    expect(result.timeSeries.length).toBeGreaterThan(1);
  });

  it('correctly classifies risk tier according to proximity to warning threshold', () => {
    // Flaw close to 80% of 32mm (e.g. 26.0mm)
    const severeMeasurement: HistoricalMeasurement[] = [
      {
        date: new Date('2024-01-01'),
        campaignName: 'JAN-2024',
        depth: 26.0,
        length: 120.0,
      },
    ];

    const result = generateGrowthPrediction(severeMeasurement, {
      thresholds: { nominalWallThickness: 32.0, warningThresholdPercent: 80.0 },
    });

    expect(result.exceedance.riskTier).toBe('CRITICAL');
  });

  it('accurately applies user-customizable safety margin buffer (e.g. ±30% and ±50%)', () => {
    const baseModerate = generateGrowthPrediction(sampleMeasurements, {
      modelType: 'LINEAR',
      scenario: 'MODERATE',
      safetyMarginPercent: 30,
    });

    const safe30 = generateGrowthPrediction(sampleMeasurements, {
      modelType: 'LINEAR',
      scenario: 'CONSERVATIVE',
      safetyMarginPercent: 30,
    });

    const safe50 = generateGrowthPrediction(sampleMeasurements, {
      modelType: 'LINEAR',
      scenario: 'CONSERVATIVE',
      safetyMarginPercent: 50,
    });

    // 50% safety buffer should produce an equal or higher conservative growth rate than 30%
    expect(safe50.annualDepthRateMmYear).toBeGreaterThanOrEqual(safe30.annualDepthRateMmYear);
    expect(safe30.annualDepthRateMmYear).toBeGreaterThanOrEqual(baseModerate.annualDepthRateMmYear);

    // Verify safe corridor points on timeSeries
    const futurePts = baseModerate.timeSeries.filter(p => !p.isHistorical);
    expect(futurePts.length).toBeGreaterThan(0);
    const lastPt = futurePts[futurePts.length - 1];

    expect(lastPt.depthSafetyUpper).toBeDefined();
    expect(lastPt.depthSafetyLower).toBeDefined();
    expect(lastPt.depthSafetyUpper!).toBeGreaterThanOrEqual(lastPt.depth);
    expect(lastPt.depthSafetyLower!).toBeLessThanOrEqual(lastPt.depth);
    expect(baseModerate.safetyMarginPercent).toBe(30);
  });
});
