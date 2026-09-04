import { describe, it, expect } from 'vitest';
import { calculateMatchScore, rankMatchingCandidates } from '../../lib/matching/matcher';

describe('Indication Matching Engine', () => {
  const mockObservation = {
    id: 101,
    sourceIndicationNumber: 'IND-01',
    weldJointId: 1,
    circumferentialPosition: 450,
    length: 12.0,
    depth: 4.0,
    indicationType: 'Crack-like',
  };

  it('assigns HIGH confidence to close spatial match on same weld', () => {
    const candidatePi = {
      id: 1,
      code: 'PI-000001',
      weldJointId: 1,
      approximateLocation: 452, // 2mm difference
      currentLength: 11.5,
      currentDepth: 3.8,
      status: 'ACTIVE',
    };

    const match = calculateMatchScore(mockObservation, candidatePi, { maxDistanceThresholdMm: 100 });
    expect(match).not.toBeNull();
    expect(match!.confidenceLevel).toBe('HIGH');
    expect(match!.confidenceScore).toBeGreaterThanOrEqual(90);
    expect(match!.distanceMm).toBe(2);
  });

  it('assigns MEDIUM confidence when distance is moderate', () => {
    const candidatePi = {
      id: 2,
      code: 'PI-000002',
      weldJointId: 1,
      approximateLocation: 510, // 60mm difference
      currentLength: 10.0,
      currentDepth: 3.0,
      status: 'ACTIVE',
    };

    const match = calculateMatchScore(mockObservation, candidatePi, { maxDistanceThresholdMm: 100 });
    expect(match).not.toBeNull();
    expect(match!.confidenceLevel).toBe('MEDIUM');
    expect(match!.recommendedStatus).toBe('REVIEW_REQUIRED');
  });

  it('returns null if on a different weld joint', () => {
    const candidatePi = {
      id: 3,
      code: 'PI-000003',
      weldJointId: 2, // Different weld!
      approximateLocation: 450,
      currentLength: 12.0,
      currentDepth: 4.0,
      status: 'ACTIVE',
    };

    const match = calculateMatchScore(mockObservation, candidatePi);
    expect(match).toBeNull();
  });

  it('ranks multiple candidates by descending confidence score', () => {
    const candidates = [
      { id: 1, code: 'PI-FAR', weldJointId: 1, approximateLocation: 520, currentLength: 10, currentDepth: 3, status: 'ACTIVE' },
      { id: 2, code: 'PI-CLOSE', weldJointId: 1, approximateLocation: 451, currentLength: 12, currentDepth: 4, status: 'ACTIVE' },
      { id: 3, code: 'PI-MED', weldJointId: 1, approximateLocation: 480, currentLength: 11, currentDepth: 3.5, status: 'ACTIVE' },
    ];

    const ranked = rankMatchingCandidates(mockObservation, candidates);
    expect(ranked.length).toBe(3);
    expect(ranked[0].physicalIndicationCode).toBe('PI-CLOSE');
    expect(ranked[1].physicalIndicationCode).toBe('PI-MED');
    expect(ranked[2].physicalIndicationCode).toBe('PI-FAR');
  });
});
