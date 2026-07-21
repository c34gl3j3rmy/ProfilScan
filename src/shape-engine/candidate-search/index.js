import { compareBaseFingerprintScores } from './base-scores.js';
import { compareAdvancedScores } from './advanced-scores.js';
import { composeCandidateScore } from './score-composition.js';
import { ADVANCED_WEIGHTS, DEFAULT_WEIGHTS, normalizeWeights } from './weights.js';

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
  const baseWeightInput = customWeights?.base || customWeights || DEFAULT_WEIGHTS;
  const weights = normalizeWeights(baseWeightInput);
  const advancedWeight = Number.isFinite(Number(customWeights?.advancedWeight))
    ? Number(customWeights.advancedWeight)
    : weights.advanced;
  const advancedWeights = customWeights?.advancedDetails
    || customWeights?.advancedWeights
    || ADVANCED_WEIGHTS;
  const base = compareBaseFingerprintScores(detected, profile.fingerprint, weights);
  const advanced = compareAdvancedScores(detected, profile, advancedWeights);
  if (!advanced) return base;

  const composition = composeCandidateScore({
    baseSubscores: base.rawSubscores || base.subscores,
    baseWeights: base.weights,
    advancedSubscores: advanced.rawSubscores || advanced.subscores,
    advancedRawScore: advanced.score,
    advancedWeight
  });

  return {
    score: composition.score,
    rawSubscores: {
      ...(base.rawSubscores || base.subscores),
      ...(advanced.rawSubscores || advanced.subscores),
      globalStage: composition.globalStage,
      localStage: composition.localStage,
      baseStage: composition.baseStage,
      advanced: composition.advanced,
      advancedRaw: composition.advancedRaw,
      ratioGate: composition.ratioGate,
      localGate: composition.localGate,
      hierarchicalBoost: composition.hierarchicalBoost
    },
    subscores: {
      ...base.subscores,
      globalStage: Math.round(composition.globalStage),
      localStage: Math.round(composition.localStage),
      baseStage: Math.round(composition.baseStage),
      advanced: Math.round(composition.advanced),
      advancedRaw: Math.round(composition.advancedRaw),
      ratioGate: Math.round(composition.ratioGate * 100),
      localGate: Math.round(composition.localGate * 100),
      hierarchicalBoost: Math.round(composition.hierarchicalBoost),
      alignment: advanced.alignment,
      ...advanced.subscores
    },
    weights: {
      ...base.weights,
      advanced: composition.advancedWeight,
      advancedDetails: advanced.weights,
      hierarchy: {
        globalStage: 0.62,
        localStage: 0.38,
        advancedGate: 'ratioGate * localGate'
      }
    }
  };
}
