import { normalizePoints, samplePoints } from './shape-normalizer.js';

export function shapeContextScore(pointsA, pointsB) {
  if (!pointsA?.length || !pointsB?.length) return 0;
  const first = histogram(samplePoints(normalizePoints(pointsA), 48));
  const second = histogram(samplePoints(normalizePoints(pointsB), 48));
  let distance = 0;
  for (let i = 0; i < first.length; i++) distance += Math.abs(first[i] - second[i]);
  return Math.max(0, Math.min(100, 100 * (1 - distance)));
}

function histogram(points) {
  const bins = Array.from({ length: 36 }, () => 0);
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    for (let j = 0; j < points.length; j++) {
      if (i === j) continue;
      const q = points[j];
      const angleBin = Math.floor(((Math.atan2(q.y - p.y, q.x - p.x) + Math.PI) / (Math.PI * 2)) * 12) % 12;
      const radiusBin = Math.min(2, Math.floor(Math.hypot(q.x - p.x, q.y - p.y) * 4));
      bins[radiusBin * 12 + angleBin]++;
    }
  }
  const total = bins.reduce((sum, value) => sum + value, 0) || 1;
  return bins.map(value => value / total);
}
