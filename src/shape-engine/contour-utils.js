export function normalizeContours(contours) {
  const sourceContours = (contours || [])
    .map(contour => ({
      points: (contour.points || contour || [])
        .map(point => ({ x: Number(point.x), y: Number(point.y) }))
        .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y)),
      closed: contour.closed !== false
    }))
    .filter(contour => contour.points.length >= 2);

  const allPoints = sourceContours.flatMap(contour => contour.points);
  if (!allPoints.length) return [];

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const point of allPoints) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const scale = Math.max(maxX - minX, maxY - minY) || 1;

  return sourceContours.map(contour => ({
    closed: contour.closed,
    points: closeIfNeeded(
      contour.points.map(point => ({
        x: (point.x - cx) / scale,
        y: (point.y - cy) / scale
      })),
      contour.closed
    )
  }));
}

export function resampleContours(contours, targetCount, epsilon) {
  const simplified = (contours || [])
    .map(contour => ({
      ...contour,
      points: simplifyPoints(contour.points || [], epsilon)
    }))
    .filter(contour => contour.points.length >= 2);

  if (!simplified.length) return [];

  const lengths = simplified.map(contour => contourLength(contour.points));
  const totalLength = lengths.reduce((sum, value) => sum + value, 0) || 1;
  const allocations = allocateCounts(
    lengths,
    totalLength,
    targetCount,
    simplified.length
  );

  return simplified
    .map((contour, index) => ({
      ...contour,
      points: sampleClosedContour(contour.points, allocations[index])
    }))
    .filter(contour => contour.points.length >= 2);
}

export function flattenContours(contours) {
  return (contours || []).flatMap(contour => contour.points || []);
}

export function simplifyPoints(points, epsilon) {
  if (points.length <= 3) return points;

  const output = [points[0]];
  for (let index = 1; index < points.length; index++) {
    const previous = output[output.length - 1];
    const point = points[index];
    if (Math.hypot(point.x - previous.x, point.y - previous.y) >= epsilon) {
      output.push(point);
    }
  }

  return closeIfNeeded(
    output,
    samePoint(points[0], points[points.length - 1])
  );
}

export function longestContour(contours) {
  if (!contours.length) return [];

  const best = contours.reduce(
    (currentBest, contour) =>
      contourLength(contour.points || []) >
      contourLength(currentBest.points || [])
        ? contour
        : currentBest,
    contours[0]
  );

  return best.points || [];
}

export function rectanglePoints(width, height) {
  return [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
    { x: 0, y: 0 }
  ];
}

function allocateCounts(lengths, totalLength, targetCount, contourCount) {
  const minimum = Math.min(
    4,
    Math.max(2, Math.floor(targetCount / Math.max(1, contourCount)))
  );
  const raw = lengths.map(length =>
    Math.max(minimum, Math.round((length / totalLength) * targetCount))
  );
  let total = raw.reduce((sum, value) => sum + value, 0);

  while (total > targetCount) {
    let bestIndex = -1;
    let bestValue = -Infinity;

    for (let index = 0; index < raw.length; index++) {
      if (raw[index] > minimum && raw[index] > bestValue) {
        bestIndex = index;
        bestValue = raw[index];
      }
    }

    if (bestIndex < 0) break;
    raw[bestIndex]--;
    total--;
  }

  while (total < targetCount && raw.length) {
    let bestIndex = 0;
    for (let index = 1; index < lengths.length; index++) {
      if (lengths[index] > lengths[bestIndex]) bestIndex = index;
    }
    raw[bestIndex]++;
    total++;
  }

  return raw;
}

function sampleClosedContour(points, targetCount) {
  const closed = closeIfNeeded(points || [], true);
  if (closed.length <= targetCount) return closed;

  const output = [];
  const step = (closed.length - 1) / Math.max(1, targetCount - 1);
  for (let index = 0; index < targetCount - 1; index++) {
    output.push(closed[Math.floor(index * step)]);
  }
  output.push({ ...output[0] });
  return output;
}

function contourLength(points) {
  let total = 0;
  for (let index = 1; index < points.length; index++) {
    total += Math.hypot(
      points[index].x - points[index - 1].x,
      points[index].y - points[index - 1].y
    );
  }
  return total;
}

function closeIfNeeded(points, closed = true) {
  if (!closed || points.length < 3) return points;
  const first = points[0];
  const last = points[points.length - 1];
  if (samePoint(first, last)) return points;
  return [...points, { x: first.x, y: first.y }];
}

function samePoint(a, b) {
  return Math.hypot(
    (a?.x || 0) - (b?.x || 0),
    (a?.y || 0) - (b?.y || 0)
  ) < 1e-9;
}
