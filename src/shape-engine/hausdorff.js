export function hausdorffScore(a, b) {
  if (!a?.length || !b?.length) return 0;
  const pa = normalize(a);
  const pb = normalize(b);
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

function normalize(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const s = Math.max(maxX - minX, maxY - minY) || 1;
  return points.map(p => ({ x: (p.x - cx) / s, y: (p.y - cy) / s }));
}
