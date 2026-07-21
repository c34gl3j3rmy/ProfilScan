export function fuseScores(scores, weights) {
  const clean = {};
  let total = 0;

  for (const key of Object.keys(scores || {})) {
    const score = Number(scores[key]);
    const weight = Number(weights?.[key] ?? 1);
    if (!Number.isFinite(score) || !Number.isFinite(weight) || weight <= 0) continue;
    clean[key] = { score: clamp(score), weight };
    total += weight;
  }

  if (total <= 0) return { score: 0, subscores: {}, rawSubscores: {}, weights: {} };

  let merged = 0;
  const subscores = {};
  const rawSubscores = {};
  const normalizedWeights = {};

  for (const [key, item] of Object.entries(clean)) {
    const normalizedWeight = item.weight / total;
    merged += item.score * normalizedWeight;
    subscores[key] = Math.round(item.score);
    rawSubscores[key] = item.score;
    normalizedWeights[key] = normalizedWeight;
  }

  return {
    score: clamp(merged),
    subscores,
    rawSubscores,
    weights: normalizedWeights
  };
}

function clamp(value) {
  return Math.max(0, Math.min(100, value));
}
