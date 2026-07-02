const DEFAULT_WEIGHTS = {
  ratio: 0.25,
  radial: 0.22,
  hu: 0.20,
  fourier: 0.18,
  angle: 0.10,
  fill: 0.05
};

export function findBestMatch(detectedFingerprint, collection, customWeights = null) {
  if (!collection?.profiles?.length || !detectedFingerprint) return null;

  let best = null;
  for (const profile of collection.profiles) {
    const scoreDetails = compareFingerprintsDetailed(detectedFingerprint, profile.fingerprint, customWeights);
    if (!best || scoreDetails.score > best.score) {
      best = { ...profile, score: scoreDetails.score, scoreDetails };
    }
  }

  return best;
}

export function compareFingerprints(detected, reference, customWeights = null) {
  return compareFingerprintsDetailed(detected, reference, customWeights).score;
}

export function compareFingerprintsDetailed(detected, reference, customWeights = null) {
  if (!reference) return emptyScore();

  const ratioScore = compareRatio(
    detected.summary?.normalizedRatio ?? detected.normalizedRatio,
    reference.summary?.normalizedRatio
  );

  const radialScore = compareVectors(
    detected.descriptors?.radial,
    reference.descriptors?.radial,
    1
  );

  const angleScore = compareVectors(
    detected.descriptors?.angleHistogram,
    reference.descriptors?.angleHistogram,
    1
  );

  const huScore = compareVectors(
    detected.descriptors?.hu,
    reference.descriptors?.hu,
    20
  );

  const fourierScore = compareVectors(
    detected.descriptors?.fourier,
    reference.descriptors?.fourier,
    1.4
  );

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

function normalizeWeights(weights) {
  const safeWeights = {
    ratio: positiveNumber(weights.ratio),
    radial: positiveNumber(weights.radial),
    hu: positiveNumber(weights.hu),
    fourier: positiveNumber(weights.fourier),
    angle: positiveNumber(weights.angle),
    fill: positiveNumber(weights.fill)
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
