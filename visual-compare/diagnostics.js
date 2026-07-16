import { numberOrNull, numericDiff, round } from '../shared/common-utils.js';

export function summarizeStoredSignature(profile) {
  const fingerprint = profile.fingerprint || profile.dna || {};
  const descriptors = fingerprint.descriptors || profile.dna?.descriptors || {};
  const minutiae = fingerprint.subsignatures?.minutiae || descriptors.minutiae || fingerprint.minutiae || {};
  const localFeature = fingerprint.subsignatures?.localFeature || descriptors.localFeature || fingerprint.localFeature || {};
  return {
    pipelineMode: fingerprint.summary?.pipelineMode || null,
    fillRatio: round(fingerprint.summary?.fillRatio),
    radialBins: Array.isArray(descriptors.radial) ? descriptors.radial.length : null,
    fourierTerms: Array.isArray(descriptors.fourier) ? descriptors.fourier.length : null,
    angleBins: Array.isArray(descriptors.angle) ? descriptors.angle.length : null,
    minutiaeCounts: minutiae.counts || null,
    localFeatures: localFeature.features || null
  };
}

export function buildScoreDiagnostics(workerDiagnostics, expectedReference) {
  const top1 = workerDiagnostics?.topCandidates?.[0] || null;
  const expected = workerDiagnostics?.expectedCandidate || null;
  const topScores = top1?.scoreSummary?.subscores || {};
  const expectedScores = expected?.scoreSummary?.subscores || {};
  const keys = Array.from(new Set([...Object.keys(topScores), ...Object.keys(expectedScores)]));
  const deltas = keys.map(key => ({
    key,
    top1: numberOrNull(topScores[key]),
    expected: numberOrNull(expectedScores[key]),
    deltaExpectedMinusTop1: numericDiff(expectedScores[key], topScores[key])
  })).filter(row => row.top1 !== null || row.expected !== null);
  const penalties = deltas.filter(row => Number.isFinite(row.deltaExpectedMinusTop1) && row.deltaExpectedMinusTop1 < 0).sort((a, b) => a.deltaExpectedMinusTop1 - b.deltaExpectedMinusTop1);
  const helps = deltas.filter(row => Number.isFinite(row.deltaExpectedMinusTop1) && row.deltaExpectedMinusTop1 > 0).sort((a, b) => b.deltaExpectedMinusTop1 - a.deltaExpectedMinusTop1);
  return {
    expectedReference,
    top1Reference: top1?.reference || null,
    expectedRank: expected?.rank || null,
    top1Score: top1?.score ?? null,
    expectedScore: expected?.score ?? null,
    scoreGap: numericDiff(top1?.score, expected?.score),
    strongestPenalty: penalties[0] || null,
    strongestHelp: helps[0] || null,
    deltas,
    top1Subscores: topScores,
    expectedSubscores: expectedScores
  };
}

export function summarizeScoreDetails(scoreDetails) {
  return {
    total: round(scoreDetails?.total ?? scoreDetails?.score),
    weighted: pickNumericMap(scoreDetails?.weighted),
    subscores: pickNumericMap(scoreDetails?.subscores),
    gates: pickNumericMap(scoreDetails?.gates),
    penalties: pickNumericMap(scoreDetails?.penalties),
    advanced: pickNumericMap(scoreDetails?.advanced)
  };
}

export function pickNumericMap(value) {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => Number.isFinite(Number(entry))).map(([key, entry]) => [key, round(entry)]));
}

export function compareStep(key, label, uploadedValue, expectedValue, tolerance, hint) {
  const diff = numericDiff(uploadedValue, expectedValue);
  const status = diff === null ? 'unknown' : Math.abs(diff) <= tolerance ? 'ok' : 'mismatch';
  return { key, label, uploadedValue, expectedValue, difference: diff, tolerance, status, hint: status === 'mismatch' ? hint : null };
}

export function statusStep(key, label, status, value, hint) {
  return { key, label, uploadedValue: value, expectedValue: 'ok', difference: null, tolerance: null, status, hint: status === 'mismatch' ? hint : null };
}
