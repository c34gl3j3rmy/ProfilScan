import { compareBaseFingerprintScores, combineBaseStages } from './base-scores.js';
import { compareAdvancedScores, computeHierarchicalBoost, computeLocalGate, computeRatioGate } from './advanced-scores.js';
import { DEFAULT_WEIGHTS, normalizeWeights } from './weights.js';
import { clampScore } from './score-utils.js';

export function findBestMatch(detectedFingerprint, collection, customWeights = null) {
  return findTopMatches(detectedFingerprint, collection, customWeights, 1)[0] || null;
}

export function findTopMatches(detectedFingerprint, collection, customWeights = null, limit = 10) {
  if (!collection?.profiles?.length || !detectedFingerprint) return [];

  return collection.profiles
    .map(profile => {
      const scoreDetails = compareProfileDetailed(detectedFingerprint, profile, customWeights);
      return { ...profile, score: scoreDetails.score, scoreDetails };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, limit));
}

export function compareFingerprints(detected, reference, customWeights = null) {
  return compareFingerprintsDetailed(detected, reference, customWeights).score;
}

export function compareFingerprintsDetailed(detected, reference, customWeights = null) {
  return compareBaseFingerprintScores(detected, reference, customWeights);
}

function compareProfileDetailed(detected, profile, customWeights = null) {
  const weights = normalizeWeights(customWeights || DEFAULT_WEIGHTS);
  const base = compareBaseFingerprintScores(detected, profile.fingerprint, weights);
  const advanced = compareAdvancedScores(detected, profile);
  if (!advanced) return base;

  const ratioGate = computeRatioGate(base.subscores.ratio);
  const localGate = computeLocalGate(base.subscores.localStage);
  const advancedScore = advanced.score * ratioGate * localGate;
  const baseStage = combineBaseStages(base.subscores.globalStage, base.subscores.localStage);
  const hierarchicalBoost = computeHierarchicalBoost(base.subscores, advanced.subscores);
  const score = baseStage * (1 - weights.advanced) + advancedScore * weights.advanced + hierarchicalBoost;

  return {
    score: clampScore(score),
    subscores: {
      ...base.subscores,
      baseStage: Math.round(baseStage),
      advanced: Math.round(advancedScore),
      advancedRaw: Math.round(advanced.score),
      ratioGate: Math.round(ratioGate * 100),
      localGate: Math.round(localGate * 100),
      hierarchicalBoost: Math.round(hierarchicalBoost),
      alignment: advanced.alignment,
      ...advanced.subscores
    },
    weights: {
      ...base.weights,
      advanced: weights.advanced,
      advancedDetails: advanced.weights,
      hierarchy: {
        globalStage: 0.62,
        localStage: 0.38,
        advancedGate: 'ratioGate * localGate'
      }
    }
  };
}
