export function weightedAverage(scores, weights, keys) {
  const total = keys.reduce((sum, key) => sum + Math.max(0, Number(weights?.[key]) || 0), 0);
  if (total <= 0) return 0;
  return keys.reduce((sum, key) => sum + (Number(scores[key]) || 0) * Math.max(0, Number(weights?.[key]) || 0), 0) / total;
}

export function emptyScore() {
  return {
    score: 0,
    subscores: {},
    weights: {}
  };
}

export function compareRatio(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  const directDistance = Math.abs(a - b);
  const rotatedDistance = Math.abs(a + b);
  const distance = Math.min(directDistance, rotatedDistance);
  return clampScore(100 * (1 - distance / Math.log(2)));
}

export function compareCircularVectors(a, b, distanceScale = 1) {
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || !b.length) {
    return { score: 0, shift: 0, reversed: false };
  }

  const length = Math.min(a.length, b.length);
  const forward = bestCircularVectorScore(a, b, length, distanceScale, false);
  const reversed = bestCircularVectorScore(a, b, length, distanceScale, true);
  return reversed.score > forward.score ? reversed : forward;
}

export function compareVectors(a, b, distanceScale = 1) {
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

export function compareFillRatio(detectedFillRatio, referenceFillRatio) {
  if (!Number.isFinite(detectedFillRatio) || !Number.isFinite(referenceFillRatio)) return 0;
  if (detectedFillRatio <= 0 || referenceFillRatio <= 0) return 0;
  const scale = Math.max(detectedFillRatio, referenceFillRatio, 1e-6);
  const relativeDifference = Math.abs(detectedFillRatio - referenceFillRatio) / scale;
  return clampScore(100 * (1 - relativeDifference));
}

export function clampScore(score) {
  return Math.max(0, Math.min(100, score));
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
