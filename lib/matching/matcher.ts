export interface MatchingCandidateObservation {
  id: number;
  sourceIndicationNumber: string;
  weldJointId: number;
  circumferentialPosition: number;
  length: number;
  depth: number;
  indicationType?: string | null;
}

export interface MatchingCandidatePhysicalIndication {
  id: number;
  code: string;
  weldJointId: number;
  approximateLocation: number;
  currentLength?: number | null;
  currentDepth?: number | null;
  status: string;
}

export interface MatchScoringResult {
  physicalIndicationId: number;
  physicalIndicationCode: string;
  confidenceScore: number; // 0 to 100
  confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  distanceMm: number;
  lengthDeltaMm: number;
  depthDeltaMm: number;
  explanation: string;
  recommendedStatus: 'AUTOMATIC' | 'REVIEW_REQUIRED' | 'POTENTIAL_NEW';
}

export interface MatchingOptions {
  maxDistanceThresholdMm?: number; // default: 100mm
  highConfidenceThreshold?: number; // default: 80%
  mediumConfidenceThreshold?: number; // default: 50%
}

export function calculateMatchScore(
  obs: MatchingCandidateObservation,
  pi: MatchingCandidatePhysicalIndication,
  options: MatchingOptions = {}
): MatchScoringResult | null {
  const maxDist = options.maxDistanceThresholdMm ?? 100;
  const highThreshold = options.highConfidenceThreshold ?? 80;
  const mediumThreshold = options.mediumConfidenceThreshold ?? 50;

  // 1. Must be on the exact same weld joint
  if (obs.weldJointId !== pi.weldJointId) {
    return null;
  }

  // 2. Circumferential spatial proximity
  const distanceMm = Math.abs((obs.circumferentialPosition || 0) - (pi.approximateLocation || 0));
  if (distanceMm > maxDist * 2.5) {
    // Too far apart to even consider as a candidate
    return null;
  }

  const distanceScore = Math.max(0, 1 - distanceMm / maxDist);

  // 3. Length comparison
  const piLen = pi.currentLength ?? obs.length;
  const lengthDeltaMm = Math.abs(obs.length - piLen);
  const maxLenRef = Math.max(obs.length, piLen, 10);
  const lengthScore = Math.max(0, 1 - lengthDeltaMm / maxLenRef);

  // 4. Depth comparison
  const piDepth = pi.currentDepth ?? obs.depth;
  const depthDeltaMm = Math.abs(obs.depth - piDepth);
  const maxDepthRef = Math.max(obs.depth, piDepth, 5);
  const depthScore = Math.max(0, 1 - depthDeltaMm / maxDepthRef);

  // 5. Weighted composite confidence score
  // Distance: 50%, Length: 30%, Depth: 20%
  const compositeScore = (distanceScore * 0.50 + lengthScore * 0.30 + depthScore * 0.20) * 100;
  const roundedScore = Math.round(compositeScore * 10) / 10;

  let confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
  let recommendedStatus: 'AUTOMATIC' | 'REVIEW_REQUIRED' | 'POTENTIAL_NEW' = 'POTENTIAL_NEW';

  if (roundedScore >= highThreshold) {
    confidenceLevel = 'HIGH';
    recommendedStatus = 'AUTOMATIC';
  } else if (roundedScore >= mediumThreshold) {
    confidenceLevel = 'MEDIUM';
    recommendedStatus = 'REVIEW_REQUIRED';
  }

  // Generate human-readable explanation
  const explanation = `Spatial match within ${distanceMm.toFixed(1)} mm on weld (score: ${(distanceScore * 100).toFixed(0)}%). Length delta: ${lengthDeltaMm.toFixed(1)} mm. Depth delta: ${depthDeltaMm.toFixed(1)} mm.`;

  return {
    physicalIndicationId: pi.id,
    physicalIndicationCode: pi.code,
    confidenceScore: roundedScore,
    confidenceLevel,
    distanceMm: Math.round(distanceMm * 10) / 10,
    lengthDeltaMm: Math.round(lengthDeltaMm * 10) / 10,
    depthDeltaMm: Math.round(depthDeltaMm * 10) / 10,
    explanation,
    recommendedStatus,
  };
}

export function rankMatchingCandidates(
  obs: MatchingCandidateObservation,
  existingPis: MatchingCandidatePhysicalIndication[],
  options: MatchingOptions = {}
): MatchScoringResult[] {
  const scoredCandidates: MatchScoringResult[] = [];

  for (const pi of existingPis) {
    const scoreResult = calculateMatchScore(obs, pi, options);
    if (scoreResult) {
      scoredCandidates.push(scoreResult);
    }
  }

  // Sort candidates by confidence score descending
  scoredCandidates.sort((a, b) => b.confidenceScore - a.confidenceScore);
  return scoredCandidates;
}
