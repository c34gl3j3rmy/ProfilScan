import { numberOrNull, round, sameReference } from './benchmark-utils.js';

export function buildCandidateSearchDiagnostics(result) {
  if (!result.expectedKnownInBase) {
    return { status: 'expected-not-in-base', expectedReference: result.expectedReference };
  }
  if (!result.detectedItems) {
    return { status: 'no-detection', expectedReference: result.expectedReference };
  }
  if (!result.expectedRank) {
    return {
      status: 'expected-missing-from-full-ranking',
      expectedReference: result.expectedReference,
      inspectedCandidateLimit: result.candidateCount,
      bestReference: result.bestReference
    };
  }

  return {
    status: result.expectedRank === 1
      ? 'expected-top1'
      : result.expectedRank <= 3
        ? 'expected-in-top3'
        : result.expectedRank <= 10
          ? 'expected-in-top10'
          : 'expected-ranked-outside-top10',
    expectedReference: result.expectedReference,
    expectedRank: result.expectedRank,
    candidateCount: result.candidateCount,
    bestReference: result.bestReference,
    bestScore: result.bestScore,
    expectedScore: result.expectedCandidate?.score ?? null,
    scoreGap: round((result.bestScore ?? 0) - (result.expectedCandidate?.score ?? 0))
  };
}

export function buildFailureAnalysis(result) {
  if (!result.expectedKnownInBase) return { dominantReason: 'reference-absente' };
  if (!result.detectedItems) return { dominantReason: 'no-detection' };
  if (!result.expectedRank) return { dominantReason: 'expected-missing-from-full-ranking' };

  const harmful = result.algorithmAudit?.rows
    ?.filter(row => Number(row.delta) < 0)
    .sort((a, b) => a.delta - b.delta)
    .slice(0, 6) || [];
  const helpful = result.algorithmAudit?.rows
    ?.filter(row => Number(row.delta) > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 6) || [];

  return {
    dominantReason: result.expectedRank > 10 ? 'signature-or-scoring-gap' : 'scoring-fusion-issue',
    expectedRank: result.expectedRank,
    harmfulAlgorithms: harmful,
    helpfulAlgorithms: helpful
  };
}

export function buildGeometryDiagnostics(expectedProfile, bestProfile, best, expectedCandidate) {
  return {
    expected: buildProfileGeometry(expectedProfile),
    best: { ...buildProfileGeometry(bestProfile), score: round(best?.score) },
    expectedCandidate: { ...buildProfileGeometry(expectedProfile), score: round(expectedCandidate?.score) }
  };
}

export function buildProfileGeometry(profile) {
  if (!profile) return {};
  const width = Number(profile.width);
  const height = Number(profile.height);
  const area = Number(profile.surface || profile.area);
  const perimeter = Number(profile.perimeter || profile.externalPerimeter || profile.totalPerimeter);
  const fingerprint = profile.fingerprint || profile.dna;

  return {
    reference: profile.reference,
    width: round(width),
    height: round(height),
    ratio: Number.isFinite(width / height) ? round(width / height) : null,
    area: round(area),
    perimeter: round(perimeter),
    compactness: Number.isFinite(area / (width * height)) ? round(area / (width * height)) : null,
    fillRatio: round(fingerprint?.summary?.fillRatio),
    contourCount: fingerprint?.summary?.contourCount ?? fingerprint?.contour?.contours?.length ?? null
  };
}

export function buildDetectionDiagnostics(analysis, autoSettings) {
  const contours = analysis.debug?.contours || [];
  return {
    source: autoSettings?.source || null,
    contours: contours.length,
    holes: contours.reduce((sum, contour) => sum + (contour.holes?.length || 0), 0),
    detectedItems: analysis.items?.length || 0,
    segmentationMode: analysis.debug?.segmentationMode || null
  };
}

export function summarizeSegmentation(segmentation) {
  if (!segmentation) return null;
  return {
    mode: segmentation.mode || null,
    components: numberOrNull(segmentation.components),
    keptComponents: numberOrNull(segmentation.keptComponents),
    rejectedComponents: numberOrNull(segmentation.rejectedComponents),
    threshold: numberOrNull(segmentation.threshold),
    edgePixels: numberOrNull(segmentation.edgePixels),
    filledPixels: numberOrNull(segmentation.filledPixels)
  };
}

export function findProfile(collection, reference) {
  return collection?.profiles?.find(profile => sameReference(profile.reference, reference)) || null;
}
