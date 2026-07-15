import { average, clamp, round, sameReference } from './benchmark-utils.js';

export const ALGORITHM_KEYS = [
  'globalStage', 'localStage', 'baseStage', 'ratio', 'radial', 'hu',
  'fourier', 'angle', 'fill', 'minutiae', 'localFeature', 'advanced',
  'advancedRaw', 'ratioGate', 'localGate', 'hausdorff', 'shapeContext',
  'icp', 'ransac', 'zernike', 'efd', 'structural'
];

export function buildAlgorithmRanks(candidates, expectedReference, bestReference) {
  return ALGORITHM_KEYS.map(key => {
    const ranked = candidates
      .map(candidate => ({ reference: candidate.reference, score: scoreValue(candidate, key) }))
      .filter(candidate => Number.isFinite(candidate.score))
      .sort((a, b) => b.score - a.score);

    const expectedIndex = ranked.findIndex(candidate => sameReference(candidate.reference, expectedReference));
    const bestIndex = ranked.findIndex(candidate => sameReference(candidate.reference, bestReference));

    return {
      key,
      winnerReference: ranked[0]?.reference || null,
      expectedRank: expectedIndex >= 0 ? expectedIndex + 1 : null,
      bestRank: bestIndex >= 0 ? bestIndex + 1 : null
    };
  });
}

export function buildAlgorithmVotes(algorithmRanks, expectedReference, bestReference) {
  const perAlgorithm = algorithmRanks.map(row => ({
    ...row,
    vote: !row.winnerReference
      ? 'none'
      : sameReference(row.winnerReference, expectedReference)
        ? 'expected'
        : sameReference(row.winnerReference, bestReference)
          ? 'currentTop1'
          : 'other'
  }));

  const counts = perAlgorithm.reduce((output, row) => {
    output[row.vote] = (output[row.vote] || 0) + 1;
    return output;
  }, {});

  return { counts, perAlgorithm };
}

export function buildAlgorithmAudit(best, expectedCandidate) {
  const rows = ALGORITHM_KEYS.map(key => {
    const bestScore = scoreValue(best, key);
    const expectedScore = scoreValue(expectedCandidate, key);
    const delta = Number.isFinite(bestScore) && Number.isFinite(expectedScore)
      ? round(expectedScore - bestScore)
      : null;
    return { key, bestScore, expectedScore, delta };
  });

  return {
    expectedFound: Boolean(expectedCandidate),
    rows,
    expectedWins: rows.filter(row => Number(row.delta) > 0).map(row => row.key),
    bestWins: rows.filter(row => Number(row.delta) < 0).map(row => row.key)
  };
}

export function summarizeAlgorithmEffectiveness(results) {
  const failed = results.filter(result => result.expectedKnownInBase && !result.success && result.expectedCandidate);

  return ALGORITHM_KEYS.map(key => {
    const rows = failed
      .map(result => result.algorithmAudit?.rows?.find(row => row.key === key))
      .filter(row => Number.isFinite(row?.delta));
    const expectedWins = rows.filter(row => row.delta > 0).length;
    const bestWins = rows.filter(row => row.delta < 0).length;
    const averageDelta = average(rows.map(row => row.delta));
    const samples = rows.length;
    const effectivenessScore = samples
      ? clamp(round(50 + ((expectedWins - bestWins) / samples) * 35 + clamp(averageDelta || 0, -25, 25) * 0.6), 0, 100)
      : null;

    return {
      key,
      samples,
      expectedWins,
      bestWins,
      neutral: rows.filter(row => row.delta === 0).length,
      averageDelta,
      effectivenessScore,
      recommendation: algorithmRecommendation(effectivenessScore, samples, expectedWins, bestWins, averageDelta)
    };
  }).sort((a, b) => (b.effectivenessScore ?? -1) - (a.effectivenessScore ?? -1));
}

export function summarizeGlobalAlgorithmVotes(results) {
  return ALGORITHM_KEYS.map(key => {
    const votes = { expected: 0, currentTop1: 0, other: 0, none: 0 };
    const winners = new Map();

    for (const result of results.filter(item => item.expectedKnownInBase && !item.success)) {
      const vote = result.algorithmVotes?.perAlgorithm?.find(row => row.key === key);
      if (!vote?.winnerReference) votes.none++;
      else if (sameReference(vote.winnerReference, result.expectedReference)) votes.expected++;
      else if (sameReference(vote.winnerReference, result.bestReference)) votes.currentTop1++;
      else votes.other++;

      if (vote?.winnerReference) {
        winners.set(vote.winnerReference, (winners.get(vote.winnerReference) || 0) + 1);
      }
    }

    return {
      key,
      votes,
      topWinners: Array.from(winners.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([reference, count]) => ({ reference, count }))
    };
  });
}

export function scoreValue(candidate, key) {
  return round(candidate?.scoreDetails?.subscores?.[key]);
}

export function algorithmRecommendation(score, samples, expectedWins, bestWins, averageDelta) {
  if (!samples) return 'insufficient-data';
  if (score >= 68 && expectedWins > bestWins) return 'increase';
  if (score <= 28 && bestWins > expectedWins && (averageDelta || 0) < -8) return 'disable';
  if (score <= 38 && bestWins > expectedWins) return 'reduce';
  return 'neutral';
}
