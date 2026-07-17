export function buildAngleHistogram(contours, binCount) {
  const size = positiveInteger(binCount, 16);
  const bins = Array.from({ length: size }, () => 0);

  for (const contour of contours || []) {
    const points = contour?.points || contour || [];
    for (let index = 1; index < points.length; index++) {
      const previous = points[index - 1];
      const point = points[index];
      const dx = Number(point?.x) - Number(previous?.x);
      const dy = Number(point?.y) - Number(previous?.y);
      if (!Number.isFinite(dx) || !Number.isFinite(dy) || (!dx && !dy)) continue;

      const angle = Math.atan2(dy, dx);
      const bin = Math.floor(
        ((angle + Math.PI) / (Math.PI * 2)) * size
      ) % size;
      bins[bin]++;
    }
  }

  const total = bins.reduce((sum, value) => sum + value, 0);
  return total ? bins.map(value => value / total) : bins;
}

function positiveInteger(value, fallback) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}
