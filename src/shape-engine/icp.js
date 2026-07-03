export function icpScore(a, b) {
  if (!a?.length || !b?.length) return 0;
  let moving = normalize(a);
  const target = normalize(b);
  for (let step = 0; step < 8; step++) {
    const delta = centroidDelta(moving, target);
    moving = moving.map(p => ({ x: p.x + delta.x, y: p.y + delta.y }));
  }
  let error = 0;
  for (const p of moving) error += distance(p, nearest(p, target));
  error /= moving.length;
  return Math.max(0, Math.min(100, 100 * (1 - error / 0.35)));
}

function centroidDelta(a, b) {
  const ca = centroid(a);
  const cb = centroid(b);
  return { x: cb.x - ca.x, y: cb.y - ca.y };
}

function centroid(points) {
  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

function nearest(p, cloud) {
  let best = cloud[0];
  let bestDistance = Infinity;
  for (const q of cloud) {
    const d = distance(p, q);
    if (d < bestDistance) { bestDistance = d; best = q; }
  }
  return best;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function normalize(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const scale = Math.max(maxX - minX, maxY - minY) || 1;
  return points.map(p => ({ x: (p.x - cx) / scale, y: (p.y - cy) / scale }));
}
