import { hausdorffScore } from './hausdorff.js';
import { shapeContextScore } from './shape-context.js';
import { icpScore } from './icp.js';
import { ransacLineScore } from './ransac.js';
import { zernikeLikeScore } from './zernike.js';
import { fuseScores } from './score-fusion.js';

const DEFAULT_WEIGHTS = {
  ratio: 0.20,
  radial: 0.18,
  hu: 0.16,
  fourier: 0.14,
  angle: 0.08,
  fill: 0.04,
  advanced: 0.20
};

const ADVANCED_WEIGHTS = {
  hausdorff: 0.25,
  shapeContext: 0.25,
  icp: 0.20,
  ransac: 0.10,
  zernike: 0.20
};

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
  const base = compareBaseFingerprintScores(detected, profile.fingerprint, customWeights);
  const advanced = compareAdvancedScores(detected, profile);
  if (!advanced) return base;

  const weights = normalizeWeights(customWeights || DEFAULT_WEIGHTS);
  const score = base.score * (1 - weights.advanced) + advanced.score * weights.advanced;

  return {
    score: clampScore(score),
    subscores: {
      ...base.subscores,
      advanced: Math.round(advanced.score),
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

  const ratioScore = compareRatio(detected.summary?.normalizedRatio ?? detected.normalizedRatio, reference.summary?.normalizedRatio);
  const radialScore = compareVectors(detected.descriptors?.radial, reference.descriptors?.radial, 1);
  const angleScore = compareVectors(detected.descriptors?.angleHistogram, reference.descriptors?.angleHistogram, 1);
  const huScore = compareVectors(detected.descriptors?.hu, reference.descriptors?.hu, 20);
  const fourierScore = compareVectors(detected.descriptors?.fourier, reference.descriptors?.fourier, 1.4);
  const fillScore = compareFillRatio(detected.summary?.fillRatio ?? detected.fillRatio);
  const weights = normalizeWeights(customWeights || DEFAULT_WEIGHTS);

  const score =
    ratioScore * weights.ratio +
    radialScore * weights.radial +
    huScore * weights.hu +
    fourierScore * weights.fourier +
    angleScore * weights.angle +
    fillScore * weights.fill;

  return {
    score: clampScore(score),
    subscores: {
      ratio: Math.round(ratioScore),
      radial: Math.round(radialScore),
      hu: Math.round(huScore),
      fourier: Math.round(fourierScore),
      angle: Math.round(angleScore),
      fill: Math.round(fillScore)
    },
    weights
  };
}

function compareAdvancedScores(detected, profile) {
  const detectedPoints = detected.descriptors?.points || detected.contour?.normalizedPoints;
  const referencePoints = profile.dna?.contour?.normalizedPoints || profile.fingerprint?.descriptors?.points;
  if (!detectedPoints?.length || !referencePoints?.length) return null;

  return fuseScores(
    {
      hausdorff: hausdorffScore(detectedPoints, referencePoints),
      shapeContext: shapeContextScore(detectedPoints, referencePoints),
      icp: icpScore(detectedPoints, referencePoints),
      ransac: (ransacLineScore(detectedPoints) + ransacLineScore(referencePoints)) / 2,
      zernike: zernikeLikeScore(detectedPoints, referencePoints)
    },
    ADVANCED_WEIGHTS
  );
}

function normalizeWeights(weights) {
  const safeWeights = {
    ratio: positiveNumber(weights.ratio),
    radial: positiveNumber(weights.radial),
    hu: positiveNumber(weights.hu),
    fourier: positiveNumber(weights.fourier),
    angle: positiveNumber(weights.angle),
    fill: positiveNumber(weights.fill),
    advanced: positiveNumber(weights.advanced)
  };

  const total = Object.values(safeWeights).reduce((sum, value) => sum + value, 0);
  if (total <= 0) return DEFAULT_WEIGHTS;

  return Object.fromEntries(Object.entries(safeWeights).map(([key, value]) => [key, value / total]));
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function emptyScore() {
  return {
    score: 0,
    subscores: {},
    weights: {}
  };
}

function compareRatio(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return 0;
  const distance = Math.abs(Math.log(a / b));
  return clampScore(100 * (1 - distance / Math.log(4)));
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
