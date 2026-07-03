export function zernikeLikeScore(pointsA, pointsB) {
  if (!pointsA?.length || !pointsB?.length) return 0;
  const first = zernikeLikeDescriptor(pointsA);
  const second = zernikeLikeDescriptor(pointsB);
  let distance = 0;
  for (let i = 0; i < first.length; i++) distance += Math.abs(first[i] - second[i]);
  return Math.max(0, Math.min(100, 100 * (1 - distance / first.length)));
}

export function zernikeLikeDescriptor(points) {
  const normalized = normalize(points);
  const orders = [2, 3, 4, 5, 6, 7, 8, 9];
  return orders.map(order => radialMoment(normalized, order));
}

function radialMoment(points, order) {
  if (!points.length) return 0;
  let sum = 0;
  for (const point of points) {
    const radius = Math.hypot(point.x, point.y);
    const angle = Math.atan2(point.y, point.x);
    sum += Math.pow(radius, order) * Math.abs(Math.cos(order * angle));
  }
  return sum / points.length;
}

function normalize(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x); minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const scale = Math.max(maxX - minX, maxY - minY) / 2 || 1;
  return points.map(point => ({ x: (point.x - cx) / scale, y: (point.y - cy) / scale })).filter(point => Math.hypot(point.x, point.y) <= 1.25);
}
