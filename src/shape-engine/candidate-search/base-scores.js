import { buildLocalFeatureSignature, compareLocalFeatureSignatures } from '../local-feature-signature.js';
import { compareMinutiaeSignatures } from '../minutiae-signature.js';
import { DEFAULT_WEIGHTS, GLOBAL_WEIGHT_KEYS, LOCAL_WEIGHT_KEYS, isNormalizedWeightSet, normalizeWeights } from './weights.js';
import { clampScore, compareCircularVectors, compareFillRatio, compareRatio, compareVectors, emptyScore, weightedAverage } from './score-utils.js';

export function compareBaseFingerprintScores(detected, reference, customWeights = null) {
  if (!reference) return emptyScore();

  const weights = isNormalizedWeightSet(customWeights) ? customWeights : normalizeWeights(customWeights || DEFAULT_WEIGHTS);
  const ratioScore = compareRatio(detected.summary?.normalizedRatio ?? detected.normalizedRatio, reference.summary?.normalizedRatio);
  const radial = compareCircularVectors(detected.descriptors?.radial, reference.descriptors?.radial, 1);
  const angle = compareCircularVectors(detected.descriptors?.angleHistogram, reference.descriptors?.angleHistogram, 1);
  const huScore = compareVectors(detected.descriptors?.hu, reference.descriptors?.hu, 20);
  const fourierScore = compareVectors(detected.descriptors?.fourier, reference.descriptors?.fourier, 1.4);
  const fillScore = compareFillRatio(
    detected.summary?.fillRatio ?? detected.fillRatio,
    reference.summary?.fillRatio ?? reference.fillRatio
  );
  const minutiaeScore = compareMinutiaeSignatures(detected.descriptors?.minutiae, reference.descriptors?.minutiae);
  const localFeatureScore = compareLocalFeatures(detected, reference);

  const globalStage = weightedAverage({ ratio: ratioScore, radial: radial.score, fourier: fourierScore, angle: angle.score, fill: fillScore }, weights, GLOBAL_WEIGHT_KEYS);
  const localStage = weightedAverage({ minutiae: minutiaeScore, localFeature: localFeatureScore }, weights, LOCAL_WEIGHT_KEYS);
  const baseStage = combineBaseStages(globalStage, localStage);

  return {
    score: clampScore(baseStage),
    subscores: {
      globalStage: Math.round(globalStage),
      localStage: Math.round(localStage),
      baseStage: Math.round(baseStage),
      ratio: Math.round(ratioScore),
      radial: Math.round(radial.score),
      radialShift: radial.shift,
      radialReversed: radial.reversed ? 1 : 0,
      hu: Math.round(huScore),
      huIgnored: 1,
      fourier: Math.round(fourierScore),
      angle: Math.round(angle.score),
      angleShift: angle.shift,
      angleReversed: angle.reversed ? 1 : 0,
      fill: Math.round(fillScore),
      minutiae: Math.round(minutiaeScore),
      localFeature: Math.round(localFeatureScore)
    },
    weights: { ...weights, hu: 0 }
  };
}

function compareLocalFeatures(detected, reference) {
  const detectedSignature = detected.descriptors?.localFeature || buildLocalFeatureSignature(detected.descriptors?.points || detected.contour?.normalizedPoints || []);
  const referenceSignature = reference.descriptors?.localFeature || buildLocalFeatureSignature(reference.descriptors?.points || reference.contour?.normalizedPoints || []);
  return compareLocalFeatureSignatures(detectedSignature, referenceSignature);
}

export function combineBaseStages(globalStage, localStage) {
  return clampScore((Number(globalStage) || 0) * 0.62 + (Number(localStage) || 0) * 0.38);
}
