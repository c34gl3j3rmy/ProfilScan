import { compareEllipticFourier } from '../elliptic-fourier.js';
import { buildLocalFeatureSignature, compareLocalFeatureSignatures } from '../local-feature-signature.js';
import { compareMinutiaeSignatures } from '../minutiae-signature.js';
import { compareStructuralSignatures } from '../structural-signature.js';
import { computeBaseStages } from './score-composition.js';
import { DEFAULT_WEIGHTS, isNormalizedWeightSet, normalizeWeights } from './weights.js';
import { compareCircularVectors, compareFillRatio, compareRatio, compareVectors, emptyScore } from './score-utils.js';

export function compareBaseFingerprintScores(detected, reference, customWeights = null) {
  if (!reference) return emptyScore();

  const weights = isNormalizedWeightSet(customWeights) ? customWeights : normalizeWeights(customWeights || DEFAULT_WEIGHTS);
  const ratioScore = compareRatio(detected.summary?.normalizedRatio ?? detected.normalizedRatio, reference.summary?.normalizedRatio);
  const radial = compareCircularVectors(detected.descriptors?.radial, reference.descriptors?.radial, 1);
  const angle = compareCircularVectors(detected.descriptors?.angleHistogram, reference.descriptors?.angleHistogram, 1);
  const huScore = compareVectors(detected.descriptors?.hu, reference.descriptors?.hu, 20);
  const fourierScore = compareVectors(detected.descriptors?.fourier, reference.descriptors?.fourier, 1.4);
  const efdScore = compareEllipticFourier(detected.descriptors?.efd, reference.descriptors?.efd);
  const structuralScore = compareStructuralSignatures(detected.descriptors?.structural, reference.descriptors?.structural);
  const fillScore = compareFillRatio(
    detected.summary?.fillRatio ?? detected.fillRatio,
    reference.summary?.fillRatio ?? reference.fillRatio
  );
  const minutiaeScore = compareMinutiaeSignatures(detected.descriptors?.minutiae, reference.descriptors?.minutiae);
  const localFeatureScore = compareLocalFeatures(detected, reference);
  const rawSubscores = {
    ratio: ratioScore,
    radial: radial.score,
    hu: huScore,
    fourier: fourierScore,
    efd: efdScore,
    angle: angle.score,
    fill: fillScore,
    structural: structuralScore,
    minutiae: minutiaeScore,
    localFeature: localFeatureScore
  };
  const stages = computeBaseStages(rawSubscores, weights);

  return {
    score: stages.baseStage,
    rawSubscores: {
      ...rawSubscores,
      ...stages
    },
    subscores: {
      globalStage: Math.round(stages.globalStage),
      localStage: Math.round(stages.localStage),
      baseStage: Math.round(stages.baseStage),
      ratio: Math.round(ratioScore),
      radial: Math.round(radial.score),
      radialShift: radial.shift,
      radialReversed: radial.reversed ? 1 : 0,
      hu: Math.round(huScore),
      huIgnored: 1,
      fourier: Math.round(fourierScore),
      efd: Math.round(efdScore),
      angle: Math.round(angle.score),
      angleShift: angle.shift,
      angleReversed: angle.reversed ? 1 : 0,
      fill: Math.round(fillScore),
      structural: Math.round(structuralScore),
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
