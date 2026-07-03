import { normalizePoints } from './shape-normalizer.js';

export function ransacLineScore(points, tries = 48, tolerance = 0.035) {
  if (!points?.length || points.length < 8) return 0;
  const cloud = normalizePoints(points);
  let best = 0;

  for (let i = 0; i < tries; i++) {
    const a = cloud[(i * 17) % cloud.length];
    const b = cloud[(i * 31 + 7) % cloud.length];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length <= 0) continue;

    let inliers = 0;
    for (const p of cloud) {
      const d = Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / length;
      if (d <= tolerance) inliers++;
    }

    best = Math.max(best, inliers / cloud.length);
  }

  return Math.max(0, Math.min(100, best * 100));
}
