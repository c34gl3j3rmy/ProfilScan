export function fuseScores(scores, weights) {
  const clean = {};
  let total = 0;

  for (const key of Object.keys(scores || {})) {
    const score = Number(scores[key]);
    const weight = Number(weights?.[key] ?? 1);
    if (!Number.isFinite(score) || !Number.isFinite(weight) || weight <= 0) continue;
    clean[key] = { score