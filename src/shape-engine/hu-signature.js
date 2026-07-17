export function buildHuMoments(points) {
  const validPoints = normalizePoints(points);
  if (!validPoints.length) return Array.from({ length: 7 }, () => 0);

  const raw = momentSet(validPoints);
  const cx = raw.m10 / raw.m00;
  const cy = raw.m01 / raw.m00;
  const mu20 = centralMoment(validPoints, cx, cy, 2, 0);
  const mu02 = centralMoment(validPoints, cx, cy, 0, 2);
  const mu11 = centralMoment(validPoints, cx, cy, 1, 1);
  const mu30 = centralMoment(validPoints, cx, cy, 3, 0);
  const mu03 = centralMoment(validPoints, cx, cy, 0, 3);
  const mu21 = centralMoment(validPoints, cx, cy, 2, 1);
  const mu12 = centralMoment(validPoints, cx, cy, 1, 2);
  const n20 = eta(mu20, raw.m00, 2, 0);
  const n02 = eta(mu02, raw.m00, 0, 2);
  const n11 = eta(mu11, raw.m00, 1, 1);
  const n30 = eta(mu30, raw.m00, 3, 0);
  const n03 = eta(mu03, raw.m00, 0, 3);
  const n21 = eta(mu21, raw.m00, 2, 1);
  const n12 = eta(mu12, raw.m00, 1, 2);

  const h1 = n20 + n02;
  const h2 = (n20 - n02) ** 2 + 4 * n11 ** 2;
  const h3 = (n30 - 3 * n12) ** 2 + (3 * n21 - n03) ** 2;
  const h4 = (n30 + n12) ** 2 + (n21 + n03) ** 2;
  const h5 = (n30 - 3 * n12) * (n30 + n12) *
    ((n30 + n12) ** 2 - 3 * (n21 + n03) ** 2) +
    (3 * n21 - n03) * (n21 + n03) *
    (3 * (n30 + n12) ** 2 - (n21 + n03) ** 2);
  const h6 = (n20 - n02) *
    ((n30 + n12) ** 2 - (n21 + n03) ** 2) +
    4 * n11 * (n30 + n12) * (n21 + n03);
  const h7 = (3 * n21 - n03) * (n30 + n12) *
    ((n30 + n12) ** 2 - 3 * (n21 + n03) ** 2) -
    (n30 - 3 * n12) * (n21 + n03) *
    (3 * (n30 + n12) ** 2 - (n21 + n03) ** 2);

  return [h1, h2, h3, h4, h5, h6, h7].map(logSigned);
}

function normalizePoints(points) {
  return (Array.isArray(points) ? points : [])
    .map(point => ({ x: Number(point?.x), y: Number(point?.y) }))
    .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
}

function momentSet(points) {
  return points.reduce((sum, point) => ({
    m00: sum.m00 + 1,
    m10: sum.m10 + point.x,
    m01: sum.m01 + point.y
  }), { m00: 0, m10: 0, m01: 0 });
}

function centralMoment(points, cx, cy, p, q) {
  return points.reduce(
    (sum, point) => sum + (point.x - cx) ** p * (point.y - cy) ** q,
    0
  );
}

function eta(mu, m00, p, q) {
  return mu / (m00 ** (1 + (p + q) / 2));
}

function logSigned(value) {
  return Math.sign(value) * Math.log10(Math.abs(value) + 1e-30);
}
