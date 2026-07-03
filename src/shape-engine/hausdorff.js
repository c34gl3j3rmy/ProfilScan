import { normalizePoints } from './shape-normalizer.js';

export function hausdorffScore(a, b) {
  if (!a?.length || !b?.length) return 0;
  const pa = normalizePoints(a);
  const pb = normalizePoints(b);
  const d = Math.max(oneWay(pa, pb), oneWay(pb, pa));
  return Math.max(0, Math.min(100, 100 * (1 - d / 1.25)));
}

function oneWay(a, b) {
  let maxMin = 0;
  for (const p of a) {
    let min = Infinity;
    for (const q of b) {
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      if (d < min) min = d;
    }
    if (min > maxMin) maxMin = min;
  }
  return maxMin;
}
