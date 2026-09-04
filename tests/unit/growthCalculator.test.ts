import { describe, it, expect } from 'vitest';
import { calculateGrowth, computeIndicationHistories, ObservationPoint } from '../../lib/analytics/growthCalculator';

describe('Growth Calculator Engine', () => {
  it('correctly calculates length and depth growth over a 1 year interval', () => {
    const prev: ObservationPoint = {
      observationId: 1,
      inspectionId: 101,
      inspectionDate: new Date('2024-01-01'),
      campaignName: 'Campaign 2024',
      weldName: 'W01',
      circumferentialPosition: 450,
      length: 10.0,
      depth: 4.0,
      indicationType: 'Crack-like',
    };

    const curr: ObservationPoint = {
      observationId: 2,
      inspectionId: 102,
      inspectionDate: new Date('2025-01-01'),
      campaignName: 'Campaign 2025',
      weldName: 'W01',
      circumferentialPosition: 450,
      length: 13.0,
      depth: 5.0,
      indicationType: 'Crack-like',
    };

    const metrics = calculateGrowth(prev, curr);

    expect(metrics.lengthDelta).toBe(3.0); // +3 mm
    expect(metrics.lengthPercentChange).toBe(30); // +30%
    expect(metrics.depthDelta).toBe(1.0); // +1 mm
    expect(metrics.daysInterval).toBe(366); // Leap year 2024
    expect(metrics.lengthGrowthRatePerYear).toBeCloseTo(3.0, 1); // ~3 mm/year
  });

  it('computes indication histories chronologically', () => {
    const rawMatches = [
      {
        physicalIndicationId: 1,
        code: 'PI-000001',
        weldName: 'W01',
        status: 'ACTIVE',
        observationId: 2,
        inspectionId: 102,
        inspectionDate: new Date('2025-05-10'),
        campaignName: 'May-2025',
        circumferentialPosition: 450,
        length: 18.5,
        depth: 6.2,
        indicationType: 'Crack',
      },
      {
        physicalIndicationId: 1,
        code: 'PI-000001',
        weldName: 'W01',
        status: 'ACTIVE',
        observationId: 1,
        inspectionId: 101,
        inspectionDate: new Date('2023-10-15'),
        campaignName: 'Oct-2023',
        circumferentialPosition: 448,
        length: 10.0,
        depth: 3.5,
        indicationType: 'Crack',
      },
    ];

    const histories = computeIndicationHistories(rawMatches);
    expect(histories.length).toBe(1);
    expect(histories[0].code).toBe('PI-000001');
    expect(histories[0].observations[0].campaignName).toBe('Oct-2023'); // Chronological order
    expect(histories[0].observations[1].campaignName).toBe('May-2025');
    expect(histories[0].growth).not.toBeNull();
    expect(histories[0].growth?.lengthDelta).toBe(8.5); // 18.5 - 10.0
  });
});
