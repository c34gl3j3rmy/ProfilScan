export function findBestMatch(detectedFingerprint, collection) {
  if (!collection?.profiles?.length || !detectedFingerprint) return null;

  let best = null;
  for (const profile of collection.profiles) {
    const score = compareFingerprints(detectedFingerprint, profile.fingerprint);
    if (!best || score > best.score) {
      best = { ...profile, score };
    }
  }

  return best;
}

export function compareFingerprints(detected, reference) {
  if (!reference) return 0;

  const ratioScore = compareRatio(
    detected.summary?.normalizedRatio ?? detected.normalizedRatio,
    reference.summary?.normalizedRatio
  );

  const radialScore = compareVectors(
    detected.descriptors?.radial,
    reference.descriptors?.radial
  );

  const angleScore = compareVectors(
    detected.descriptors?.angleHistogram,
    reference.descriptors?.angleHistogram
  );

  const fillScore = compareFillRatio(detected.summary?.fillRatio ?? detected.fillRatio);

  const finalScore =
    ratioScore * 0.45 +
    radialScore * 0.30 +
    angleScore * 0.15 +
    fillScore * 0.10;

  return Math.max(0, Math.min(100, finalScore));
}

function compareRatio(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return 0;
  const distance = Math.abs(Math.log(a / b));
  return Math.max(0, 100 * (1 - distance / Math.log(4)));
}

function compareVectors(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || !b.length) return 0;
  const length = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < length; i++) {
    const av = Number(a[i]) || 0;
    const bv = Number(b[i]) || 0;
    sum += Math.abs(av - bv);
  }
  const averageDistance = sum / length;
  return Math.max(0, 100 * (1 - averageDistance));
}

function compareFillRatio(fillRatio) {
  if (!Number.isFinite(fillRatio) || fillRatio <= 0) return 50;
  if (fillRatio > 0.02 && fillRatio < 0.85) return 100;
  return 40;
}
