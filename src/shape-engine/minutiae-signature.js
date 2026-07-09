const CONFIG = {
  cornerAngleThreshold: Math.PI / 5,
  cornerMinDistance: 0.025,
  graphGridSize: 72,
  orientationBins: 16,
  lengthBins: 12,
  maxPoints: 80,
  segmentMinLength: 0.018
};

export function buildMinutiaeSignature(points, options = {}) {
  const config = { ...CONFIG, ...options };
  const safePoints = normalizeInputPoints(points);
  if (safePoints.length < 3) return emptySignature(config);

  const closed = isClosedPolyline(safePoints, config);
  const corners = findCorners(safePoints, config);
  const terminations = closed ? [] : findTerminations(safePoints);
  const graph = buildQuantizedGraph(safePoints, config);
  const bifurcations = findBifurcations(graph, config);
  const segments = buildSegments(safePoints, corners, closed, config);
  const orientationHistogram = buildOrientationHistogram(segments, config.orientationBins);
  const lengthHistogram = buildLengthHistogram(segments, config.lengthBins);
  const remarkablePoints = [...corners, ...terminations, ...bifurcations]
    .map(point => ({ x: round(point.x), y: round(point.y), type: point.type || 'corner' }))
    .slice(0, config.maxPoints);

  return {
    version: 'minutiae-v1',
    counts: {
      corners: corners.length,
      terminations: terminations.length,
      bifurcations: bifurcations.length,
      segments: segments.length,
      remarkablePoints: remarkablePoints.length
    },
    orientationHistogram,
    lengthHistogram,
    points: remarkablePoints,
    segments: segments.slice(0, config.maxPoints).map(segment => ({
      x1: round(segment.start.x),
      y1: round(segment.start.y),
      x2: round(segment.end.x),
      y2: round(segment.end.y),
      length: round(segment.length),
      angle: round(segment.angle)
    }))
  };
}

export function compareMinutiaeSignatures(a, b) {
  if (!a || !b) return 0;

  const countScore = compareCounts(a.counts, b.counts);
  const orientationScore = compareHistogram(a.orientationHistogram, b.orientationHistogram);
  const lengthScore = compareHistogram(a.lengthHistogram, b.lengthHistogram);
  const pointScore = comparePointCloud(a.points, b.points);
  const segmentScore = compareSegments(a.segments, b.segments);

  return clampScore(
    countScore * 0.22 +
    orientationScore * 0.24 +
    lengthScore * 0.18 +
    pointScore * 0.22 +
    segmentScore * 0.14
  );
}

function emptySignature(config) {
  return {
    version: 'minutiae-v1',
    counts: { corners: 0, terminations: 0, bifurcations: 0, segments: 0, remarkablePoints: 0 },
    orientationHistogram: Array.from({ length: config.orientationBins }, () => 0),
    lengthHistogram: Array.from({ length: config.lengthBins }, () => 0),
    points: [],
    segments: []
  };
}

function normalizeInputPoints(points) {
  if (!Array.isArray(points)) return [];
  return points
    .filter(point => Number.isFinite(point?.x) && Number.isFinite(point?.y))
    .map(point => ({ x: Number(point.x), y: Number(point.y), breakBefore: Boolean(point.breakBefore) }));
}

function isClosedPolyline(points, config) {
  return splitContours(points).every(contour => contour.length > 2 && distance(contour[0], contour[contour.length - 1]) < config.cornerMinDistance);
}

function findTerminations(points) {
  return splitContours(points)
    .filter(contour => contour.length > 1)
    .flatMap(contour => [{ ...contour[0], type: 'termination' }, { ...contour[contour.length - 1], type: 'termination' }]);
}

function findCorners(points, config) {
  const corners = [];
  let lastCorner = null;

  for (let i = 1; i < points.length - 1; i++) {
    const previous = points[i - 1];
    const point = points[i];
    const next = points[i + 1];
    if (point.breakBefore || next.breakBefore) continue;
    const turn = turnAngle(previous, point, next);

    if (turn < config.cornerAngleThreshold) continue;
    if (lastCorner && distance(lastCorner, point) < config.cornerMinDistance) continue;

    const corner = { ...point, type: 'corner', strength: round(turn / Math.PI) };
    corners.push(corner);
    lastCorner = corner;
  }

  return corners;
}

function turnAngle(a, b, c) {
  const angle1 = Math.atan2(b.y - a.y, b.x - a.x);
  const angle2 = Math.atan2(c.y - b.y, c.x - b.x);
  let delta = Math.abs(angle2 - angle1);
  if (delta > Math.PI) delta = Math.PI * 2 - delta;
  return delta;
}

function buildQuantizedGraph(points, config) {
  const cells = new Map();
  const links = new Map();

  for (let i = 1; i < points.length; i++) {
    if (points[i].breakBefore) continue;
    const a = quantize(points[i - 1], config.graphGridSize);
    const b = quantize(points[i], config.graphGridSize);
    const aKey = cellKey(a);
    const bKey = cellKey(b);

    if (!cells.has(aKey)) cells.set(aKey, { ...a, x: points[i - 1].x, y: points[i - 1].y });
    if (!cells.has(bKey)) cells.set(bKey, { ...b, x: points[i].x, y: points[i].y });
    addLink(links, aKey, bKey);
    addLink(links, bKey, aKey);
  }

  return { cells, links };
}

function findBifurcations(graph, config) {
  const output = [];
  for (const [key, cell] of graph.cells.entries()) {
    const degree = graph.links.get(key)?.size || 0;
    if (degree < 3) continue;
    const point = { x: cell.x, y: cell.y, type: 'bifurcation', degree };
    if (!output.some(existing => distance(existing, point) < config.cornerMinDistance * 1.5)) output.push(point);
  }
  return output;
}

function buildSegments(points, corners, closed, config) {
  const contours = splitContours(points).filter(contour => contour.length > 1);
  const segments = [];
  for (const contour of contours) {
    const contourCorners = corners.filter(corner => contour.some(point => distance(point, corner) < config.cornerMinDistance));
    segments.push(...buildContourSegments(contour, contourCorners, closed, config));
  }
  return segments;
}

function buildContourSegments(points, corners, closed, config) {
  if (points.length < 2) return [];
  const cornerIndexes = corners
    .map(corner => nearestPointIndex(points, corner))
    .filter(index => index >= 0)
    .sort((a, b) => a - b);

  const indexes = uniqueIndexes([0, ...cornerIndexes, points.length - 1]);
  const segments = [];

  for (let i = 1; i < indexes.length; i++) {
    const segment = makeSegment(points[indexes[i - 1]], points[indexes[i]]);
    if (segment.length >= config.segmentMinLength) segments.push(segment);
  }

  if (closed && indexes.length > 2) {
    const segment = makeSegment(points[indexes[indexes.length - 1]], points[indexes[0]]);
    if (segment.length >= config.segmentMinLength) segments.push(segment);
  }

  return segments;
}

function makeSegment(start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  return {
    start,
    end,
    length: Math.hypot(dx, dy),
    angle: normalizeAngle(Math.atan2(dy, dx))
  };
}

function buildOrientationHistogram(segments, binCount) {
  const bins = Array.from({ length: binCount }, () => 0);
  let total = 0;
  for (const segment of segments) {
    const bin = Math.floor((segment.angle / Math.PI) * binCount) % binCount;
    bins[bin] += segment.length;
    total += segment.length;
  }
  return normalizeBins(bins, total);
}

function buildLengthHistogram(segments, binCount) {
  const bins = Array.from({ length: binCount }, () => 0);
  const maxLength = Math.max(...segments.map(segment => segment.length), 1);
  for (const segment of segments) {
    const bin = Math.min(binCount - 1, Math.floor((segment.length / maxLength) * binCount));
    bins[bin]++;
  }
  return normalizeBins(bins, segments.length || 1);
}

function compareCounts(a = {}, b = {}) {
  const keys = ['corners', 'terminations', 'bifurcations', 'segments', 'remarkablePoints'];
  const score = keys.reduce((sum, key) => {
    const av = Number(a[key]) || 0;
    const bv = Number(b[key]) || 0;
    const max = Math.max(av, bv, 1);
    return sum + (1 - Math.abs(av - bv) / max);
  }, 0) / keys.length;
  return clampScore(score * 100);
}

function compareHistogram(a = [], b = []) {
  const length = Math.min(a.length, b.length);
  if (!length) return 0;
  let distanceSum = 0;
  for (let i = 0; i < length; i++) distanceSum += Math.abs((Number(a[i]) || 0) - (Number(b[i]) || 0));
  return clampScore(100 * (1 - distanceSum / 2));
}

function comparePointCloud(a = [], b = []) {
  if (!a.length || !b.length) return 0;
  const sample = a.slice(0, Math.min(a.length, 40));
  const average = sample.reduce((sum, point) => sum + nearestDistance(point, b), 0) / sample.length;
  return clampScore(100 * (1 - Math.min(1, average / 0.18)));
}

function compareSegments(a = [], b = []) {
  if (!a.length || !b.length) return 0;
  const countScore = compareCount(a.length, b.length);
  const aLength = a.reduce((sum, segment) => sum + (Number(segment.length) || 0), 0);
  const bLength = b.reduce((sum, segment) => sum + (Number(segment.length) || 0), 0);
  const lengthScore = compareCount(aLength, bLength);
  return clampScore(countScore * 0.5 + lengthScore * 0.5);
}

function nearestDistance(point, points) {
  return points.reduce((best, candidate) => Math.min(best, distance(point, candidate)), Infinity);
}

function nearestPointIndex(points, target) {
  let bestIndex = -1;
  let bestDistance = Infinity;
  for (let i = 0; i < points.length; i++) {
    const currentDistance = distance(points[i], target);
    if (currentDistance < bestDistance) {
      bestDistance = currentDistance;
      bestIndex = i;
    }
  }
  return bestIndex;
}

function splitContours(points) {
  const contours = [];
  let current = [];
  for (const point of points || []) {
    if (point.breakBefore && current.length) {
      contours.push(current);
      current = [];
    }
    current.push(point);
  }
  if (current.length) contours.push(current);
  return contours;
}

function uniqueIndexes(indexes) {
  return [...new Set(indexes)].sort((a, b) => a - b);
}

function quantize(point, gridSize) {
  return {
    x: Math.round((point.x + 0.5) * gridSize),
    y: Math.round((point.y + 0.5) * gridSize)
  };
}

function cellKey(cell) {
  return `${cell.x}:${cell.y}`;
}

function addLink(links, from, to) {
  if (from === to) return;
  if (!links.has(from)) links.set(from, new Set());
  links.get(from).add(to);
}

function normalizeAngle(angle) {
  let value = Math.abs(angle) % Math.PI;
  if (value < 0) value += Math.PI;
  return value;
}

function normalizeBins(bins, total) {
  return bins.map(value => total ? round(value / total) : 0);
}

function compareCount(a, b) {
  const av = Number(a) || 0;
  const bv = Number(b) || 0;
  const max = Math.max(av, bv, 1);
  return clampScore(100 * (1 - Math.abs(av - bv) / max));
}

function distance(a, b) {
  return Math.hypot((a?.x || 0) - (b?.x || 0), (a?.y || 0) - (b?.y || 0));
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function round(value) {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}
