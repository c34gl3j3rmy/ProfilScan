import { hausdorffScore } from './hausdorff.js';
import { icpScore } from './icp.js';
import { compareMinutiaeSignatures } from './minutiae-signature.js';
import { ransacLineScore } from './ransac.js';
import { fuseScores } from './score-fusion.js';
import { normalizePoints } from './shape-normalizer.js';
import { shapeContextScore } from './shape-context.js';
import { zernikeLikeScore } from './zernike.js';

const DEFAULT_WEIGHTS = {
  ratio: 0.28,
  radial: 0.18,
  hu: 0.16,
  fourier: 0.16,
  angle: 0.08,
  fill: 0.04,
  minutiae: 0.12,
  advanced: 0.35
};

const ADVANCED_WEIGHTS = {
  hausdorff: 0.30,
  shapeContext: 0.30,
  icp: 0.25,
  ransac: 0.05,
  zernike: 0.10
};

const BASE_WEIGHT_KEYS = ['ratio', 'radial', 'hu', 'fourier', 'angle', 'fill', 'minutiae'];

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
  const advancedScore = advanced.score * ratioGate;
  const score = base.score * (1 - weights.advanced) + advancedScore * weights.advanced;

  return {
    score: clampScore(score),
    subscores: {
      ...base.subscores,
      advanced: Math.round(advancedScore),
      advancedRaw: Math.round(advanced.score),
      ratioGate: Math.round(ratioGate * 100),
      alignment: advanced.alignment,
      ...advanced.subscores
    },
    weights: {
      ...base.weights,
      advanced: weights.advanced,
      advancedDetails: advanced.weights
    }
  };
}

function compareBaseFingerprintScores(detected, reference, customWeights = null) {
  if (!reference) return emptyScore();

  const weights = isNormalizedWeightSet(customWeights) ? customWeights : normalizeWeights(customWeights || DEFAULT_WEIGHTS);
  const ratioScore = compareRatio(detected.summary?.normalizedRatio ?? detected.normalizedRatio, reference.summary?.normalizedRatio);
  const radial = compareCircularVectors(detected.descriptors?.radial, reference.descriptors?.radial, 1);
  const angle = compareCircularVectors(detected.descriptors?.angleHistogram, reference.descriptors?.angleHistogram, 1);
  const huScore = compareVectors(detected.descriptors?.hu, reference.descriptors?.hu, 20);
  const fourierScore = compareVectors(detected.descriptors?.fourier, reference.descriptors?.fourier, 1.4);
  const fillScore = compareFillRatio(detected.summary?.fillRatio ?? detected.fillRatio);
  const minutiaeScore = compareMinutiaeSignatures(detected.descriptors?.minutiae, reference.descriptors?.minutiae);

  const score =
    ratioScore * weights.ratio +
    radial.score * weights.radial +
    huScore * weights.hu +
    fourierScore * weights.fourier +
    angle.score * weights.angle +
    fillScore * weights.fill +
    minutiaeScore * weights.minutiae;

  return {
    score: clampScore(score),
    subscores: {
      ratio: Math.round(ratioScore),
      radial: Math.round(radial.score),
      radialShift: radial.shift,
      radialReversed: radial.reversed ? 1 : 0,
      hu: Math.round(huScore),
      fourier: Math.round(fourierScore),
      angle: Math.round(angle.score),
      angleShift: angle.shift,
      angleReversed: angle.reversed ? 1 : 0,
      fill: Math.round(fillScore),
      minutiae: Math.round(minutiaeScore)
    },
    weights
  };
}

function compareAdvancedScores(detected, profile) {
  const detectedPoints = detected.descriptors?.points || detected.contour?.normalizedPoints;
  const referencePoints = profile.dna?.contour?.normalizedPoints || profile.fingerprint?.descriptors?.points;
  if (!detectedPoints?.length || !referencePoints?.length) return null;

  const target = normalizePoints(referencePoints);
  const variants = buildAlignmentVariants(normalizePoints(detectedPoints));
  let best = null;

  for (const variant of variants) {
    const candidate = fuseScores(
      {
        hausdorff: hausdorffScore(variant.points, target),
        shapeContext: shapeContextScore(variant.points, target),
        icp: icpScore(variant.points, target),
        ransac: Math.min(ransacLineScore(variant.points), ransacLineScore(target)),
        zernike: zernikeLikeScore(variant.points, target)
      },
      ADVANCED_WEIGHTS
    );

    if (!best || candidate.score > best.score) {
      best = { ...candidate, alignment: variant.name };
    }
  }

  return best;
}

function buildAlignmentVariants(points) {
  const variants = [];
  const mirrorModes = [false, true];
  const rotations = [0, 90, 180, 270];

  for (const mirror of mirrorModes) {
    for (const rotation of rotations) {
      variants.push({
        name: `${mirror ? 'miroir-' : ''}rot${rotation}`,
        points: points.map(point => rotatePoint(mirror ? { x: -point.x, y: point.y } : point, rotation))
      });
    }
  }

  return variants;
}

function rotatePoint(point, degrees) {
  if (degrees === 90) return { x: -point.y, y: point.x };
  if (degrees === 180) return { x: -point.x, y: -point.y };
  if (degrees === 270) return { x: point.y, y: -point.x };
  return { x: point.x, y: point.y };
}

function normalizeWeights(weights) {
  const baseWeights = Object.fromEntries(BASE_WEIGHT_KEYS.map(key => [key, positiveWeight(weights, key)]));
  const baseTotal = Object.values(baseWeights).reduce((sum, value) => sum + value, 0);
  const fallbackTotal = BASE_WEIGHT_KEYS.reduce((sum, key) => sum + DEFAULT_WEIGHTS[key], 0);

  const normalizedBase = Object.fromEntries(BASE_WEIGHT_KEYS.map(key => {
    const value = baseTotal > 0 ? baseWeights[key] / baseTotal : DEFAULT_WEIGHTS[key] / fallbackTotal;
    return [key, value];
  }));

  return {
    ...normalizedBase,
    advanced: clampUnit(Number.isFinite(Number(weights?.advanced)) ? Number(weights.advanced) : DEFAULT_WEIGHTS.advanced)
  };
}

function isNormalizedWeightSet(weights) {
  if (!weights) return false;
  return BASE_WEIGHT_KEYS.every(key => Number.isFinite(weights[key])) && Number.isFinite(weights.advanced);
}

function computeRatioGate(ratioScore) {
  if (!Number.isFinite(ratioScore)) return 1;
  if (ratioScore >= 85) return 1;
  if (ratioScore >= 70) return 0.85;
  if (ratioScore >= 55) return 0.65;
  return 0.45;
}

function positiveWeight(weights, key) {
  const number = Number(weights?.[key]);
  if (Number.isFinite(number) && number > 0) return number;
  return DEFAULT_WEIGHTS[key] || 0;
}

function emptyScore() {
  return {
    score: 0,
    subscores: {},
    weights: {}
  };
}

function compareRatio(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  const directDistance = Math.abs(a - b);
  const rotatedDistance = Math.abs(a + b);
  const distance = Math.min(directDistance, rotatedDistance);
  return clampScore(100 * (1 - distance / Math.log(2)));
}

function compareCircularVectors(a, b, distanceScale = 1) {
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || !b.length) {
    return { score: 0, shift: 0, reversed: false };
  }

  const length = Math.min(a.length, b.length);
  const forward = bestCircularVectorScore(a, b, length, distanceScale, false);
  const reversed = bestCircularVectorScore(a, b, length, distanceScale, true);
  return reversed.score > forward.score ? reversed : forward;
}

function bestCircularVectorScore(a, b, length, distanceScale, reversed) {
  let best = { score: 0, shift: 0, reversed };

  for (let shift = 0; shift < length; shift++) {
    let sum = 0;
    for (let i = 0; i < length; i++) {
      const ai = reversed ? length - 1 - i : i;
      const bi = (i + shift) % length;
      const av = Number(a[ai]) || 0;
      const bv = Number(b[bi]) || 0;
      sum += Math.abs(av - bv);
    }

    const averageDistance = sum / length;
    const score = clampScore(100 * (1 - averageDistance / distanceScale));
    if (score > best.score) best = { score, shift, reversed };
  }

  return best;
}

function compareVectors(a, b, distanceScale = 1) {
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || !b.length) return 0;
  const length = Math.min(a.length, b.length);
  let sum = 0;

  for (let i = 0; i < length; i++) {
    const av = Number(a[i]) || 0;
    const bv = Number(b[i]) || 0;
    sum += Math.abs(av - bv);
  }

  const averageDistance = sum / length;
  return clampScore(100 * (1 - averageDistance / distanceScale));
}

function compareFillRatio(fillRatio) {
  if (!Number.isFinite(fillRatio) || fillRatio <= 0) return 50;
  if (fillRatio > 0.02 && fillRatio < 0.85) return 100;
  return 40;
}

function clampScore(score) {
  return Math.max(0, Math.min(100, score));
}

function clampUnit(value) {
  return Math.max(0, Math.min(0.75, value));
}
