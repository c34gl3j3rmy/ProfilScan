export function normalizePoints(points) {
  if (!points?.length) return [];

  const bounds = getBounds(points);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const scale = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) || 1;

  return points.map(point => ({
    x: (point.x - centerX) / scale,
    y: (point.y - centerY) / scale
  }));
}

export function samplePoints(points, count) {
  if (!points?.length) return [];
  if (points.length <= count) return points;

  const step = points.length / count;
  return Array.from({ length: count }, (_, index) => points[Math.floor(index * step)]);
}

export function getBounds(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  return { minX, minY, maxX, maxY };
}
