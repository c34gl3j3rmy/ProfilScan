export function buildRadialSignature(points, binCount) {
  const count = positiveInteger(binCount, 16);
  const bins = Array.from({ length: count }, () => 0);
  const samples = Array.from({ length: count }, () => 0);

  for (const point of normalizePoints(points)) {
    const angle = Math.atan2(point.y, point.x);
    const distance = Math.hypot(point.x, point.y);
    const bin = Math.floor(
      ((angle + Math.PI) / (Math.PI * 2)) * count
    ) % count;
    bins[bin] += distance;
    samples[bin]++;
  }

  const radial = bins.map((value, index) =>
    samples[index] ? value / samples[index] : 0
  );
  const max = Math.max(...radial, 1);
  return radial.map(value => value / max);
}

function normalizePoints(points) {
  return (Array.isArray(points) ? points : [])
    .map(point => ({ x: Number(point?.x), y: Number(point?.y) }))
    .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
}

function positiveInteger(value, fallback) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}
