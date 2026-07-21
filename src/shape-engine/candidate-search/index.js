import { compareAdvancedScores } from './advanced-scores.js';
import { compareBaseFingerprintScores } from './base-scores.js';
import { composeCandidateScore } from './score-composition.js';
import { DEFAULT_WEIGHTS, normalizeWeights } from './weights.js';

export function findBestMatch(detectedFingerprint, collection, customWeights = null) {
  return findTopMatches(detectedFingerprint, collection, customWeights, 1)[0] || null;
}

export function findTopMatches(detectedFingerprint, collection, customWeights = null, limit = 10) {
  if (!collection?.profiles?.length || !detectedFingerprint) return [];

  return collection.profiles
    .map(profile => {
      const scoreDetails = compareProfileDetailed