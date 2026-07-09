const GRID = { columns: 3, rows: 3 };
const ORIENTATION_BINS = 12;
const DEPTH_BINS = 8;

export function buildLocalFeatureSignature(points) {
  const safePoints = normalizeInput(points);
  if (safePoints.length < 3) return emptySignature();

  const segments = buildSegments(safePoints);
  const zones = buildZoneSignatures(safePoints, segments);
  const turns = buildTurns(safePoints);
  const features = buildFunctionalFeatures(safePoints, segments, turns);

  return {
    version: 'local-feature-v1',
    zones,
    features,
    orientationHistogram: buildOrientationHistogram(segments, ORIENTATION_BINS),
    lengthHistogram: buildLengthHistogram(segments, DEPTH_BINS)
  };
}

export function compareLocalFeatureSignatures(a, b) {
  if (!a || !b) return 0;

  const zoneScore = compareZones(a.zones, b.zones);
  const featureScore = compareFeatureCounts(a.features, b.features);
  const orientationScore = compareHistogram(a.orientationHistogram, b.orientationHistogram);
  const lengthScore = compareHistogram(a.lengthHistogram, b.lengthHistogram);

  return clampScore(
    zoneScore * 0.42 +
    featureScore * 0.34 +
    orientationScore * 0.14 +
    lengthScore * 0.10
  );
}

function emptySignature() {
  return {
    version: 'local-feature-v1',
    zones: [],
    features: {
      hooks: 0,
      grooves: 0,
      notches: 0,
      lips: 0,
      sharpTips: 0,
      longStraights: 0,
      dominantVerticals: 0,
      dominantHorizontals: 0
    },
    orientationHistogram: Array.from({ length: ORIENTATION_BINS }, () => 0),
    lengthHistogram: Array.from({ length: DEPTH_BINS }, () => 0)
  };
}

function normalizeInput(points) {
  if (!Array.isArray(points)) return [];
  return points
    .filter(point => Number.isFinite(point?.x) && Number.isFinite(point?.y))
    .map(point => ({ x: Number(point.x), y: Number(point.y), breakBefore: Boolean(point.breakBefore) }));
}

function buildSegments(points) {
  const segments = [];
  for (let i = 1; i < points.length; i++) {
    const start = points[i - 1];
    const end = points[i];
    if (end.breakBefore) continue;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length <= 1e-6) continue;
    segments.push({
      start,
      end,
      mid: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
      length,
      angle: normalizeHalfTurn(Math.atan2(dy, dx))
    });
  }
  return segments;
}

function buildZoneSignatures(points, segments) {
  const zones = [];
  for (let row = 0; row < GRID.rows; row++) {
    for (let column = 0; column < GRID.columns; column++) {
      const bounds = zoneBounds(column, row);
      const zonePoints = points.filter(point => inBounds(point, bounds));
      const zoneSegments = segments.filter(segment => inBounds(segment.mid, bounds));
      zones.push({
        id: `${column}:${row}`,
        pointDensity: round(zonePoints.length / Math.max(points.length, 1)),
        lengthDensity: round(zoneSegments.reduce((sum, segment) => sum + segment.length, 0) / totalLength(segments)),
        orientation: buildOrientationHistogram(zoneSegments, ORIENTATION_BINS),
        endpoints: countZoneBoundaryTouches(zoneSegments, bounds),
        turns: countLocalTurns(zonePoints)
      });
    }
  }
  return zones;
}

function buildTurns(points) {
  const turns = [];
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1];
    const b = points[i];
    const c = points[i + 1];
    if (b.breakBefore || c.breakBefore) continue;
    const previous = Math.atan2(b.y - a.y, b.x - a.x);
    const next = Math.atan2(c.y - b.y, c.x - b.x);
    let delta = Math.abs(next - previous);
    if (delta > Math.PI) delta = Math.PI * 2 - delta;
    turns.push({ point: b, value: delta });
  }
  return turns;
}

function buildFunctionalFeatures(points, segments, turns) {
  const longThreshold = percentile(segments.map(segment => segment.length), 0.78) || 0.10;
  const sharpTurns = turns.filter(turn => turn.value > Math.PI * 0.42);
  const verySharpTurns = turns.filter(turn => turn.value > Math.PI * 0.62);
  const horizontalSegments = segments.filter(segment => isHorizontal(segment.angle));
  const verticalSegments = segments.filter(segment => isVertical(segment.angle));
  const shortReturnSegments = segments.filter(segment => segment.length < longThreshold * 0.45 && (isHorizontal(segment.angle) || isVertical(segment.angle)));
  const perimeter = totalLength(segments);

  return {
    hooks: countHookPatterns(segments, turns),
    grooves: countGroovePatterns(segments),
    notches: countNotches(points, turns),
    lips: shortReturnSegments.length,
    sharpTips: verySharpTurns.length,
    longStraights: segments.filter(segment => segment.length >= longThreshold).length,
    dominantVerticals: round(verticalSegments.reduce((sum, segment) => sum + segment.length, 0) / Math.max(perimeter, 1e-6)),
    dominantHorizontals: round(horizontalSegments.reduce((sum, segment) => sum + segment.length, 0) / Math.max(perimeter, 1e-6))
  };
}

function countHookPatterns(segments, turns) {
  let count = 0;
  for (let i = 1; i < segments.length - 1; i++) {
    const a = segments[i - 1];
    const b = segments[i];
    const c = segments[i + 1];
    const hasReturn = Math.abs(normalizeHalfTurn(a.angle) - normalizeHalfTurn(c.angle)) < Math.PI / 8;
    const hasCorner = turns[i - 1]?.value > Math.PI * 0.36 || turns[i]?.value > Math.PI * 0.36;
    if (hasReturn && hasCorner && b.length < Math.max(a.length, c.length) * 0.75) count++;
  }
  return count;
}

function countGroovePatterns(segments) {
  let count = 0;
  for (let i = 2; i < segments.length - 2; i++) {
    const left = segments[i - 2];
    const middle = segments[i];
    const right = segments[i + 2];
    const parallelWalls = Math.abs(left.angle - right.angle) < Math.PI / 9;
    const bridgePerpendicular = Math.abs(normalizeHalfTurn(middle.angle - left.angle) - Math.PI / 2) < Math.PI / 6;
    if (parallelWalls && bridgePerpendicular) count++;
  }
  return count;
}

function countNotches(points, turns) {
  const centerDistances = points.map(point => Math.hypot(point.x, point.y));
  const localMedian = percentile(centerDistances, 0.50) || 0;
  return turns.filter(turn => turn.value > Math.PI * 0.32 && Math.hypot(turn.point.x, turn.point.y) < localMedian).length;
}

function countZoneBoundaryTouches(segments, bounds) {
  const margin = 0.015;
  return segments.filter(segment => (
    Math.abs(segment.mid.x - bounds.xMin) < margin ||
    Math.abs(segment.mid.x - bounds.xMax) < margin ||
    Math.abs(segment.mid.y - bounds.yMin) < margin ||
    Math.abs(segment.mid.y - bounds.yMax) < margin
  )).length;
}

function countLocalTurns(points) {
  if (points.length < 3) return 0;
  return buildTurns(points).filter(turn => turn.value > Math.PI * 0.28).length;
}

function compareZones(a = [], b = []) {
  const length = Math.min(a.length, b.length);
  if (!length) return 0;
  let score = 0;
  for (let i = 0; i < length; i++) {
    const density = 100 * (1 - Math.min(1, Math.abs((a[i].pointDensity || 0) - (b[i].pointDensity || 0)) / 0.18));
    const lengthDensity = 100 * (1 - Math.min(1, Math.abs((a[i].lengthDensity || 0) - (b[i].lengthDensity || 0)) / 0.20));
    const orientation = compareHistogram(a[i].orientation, b[i].orientation);
    const endpoints = compareCount(a[i].endpoints, b[i].endpoints);
    const turns = compareCount(a[i].turns, b[i].turns);
    score += density * 0.24 + lengthDensity * 0.26 + orientation * 0.30 + endpoints * 0.08 + turns * 0.12;
  }
  return clampScore(score / length);
}

function compareFeatureCounts(a = {}, b = {}) {
  const keys = ['hooks', 'grooves', 'notches', 'lips', 'sharpTips', 'longStraights', 'dominantVerticals', 'dominantHorizontals'];
  return clampScore(keys.reduce((sum, key) => sum + compareCount(a[key], b[key]), 0) / keys.length);
}

function compareCount(a, b) {
  const av = Number(a) || 0;
  const bv = Number(b) || 0;
  const max = Math.max(Math.abs(av), Math.abs(bv), 1);
  return clampScore(100 * (1 - Math.abs(av - bv) / max));
}

function buildOrientationHistogram(segments, binCount) {
  const bins = Array.from({ length: binCount }, () => 0);
  let total = 0;
  for (const segment of segments) {
    const bin = Math.min(binCount - 1, Math.floor((segment.angle / Math.PI) * binCount));
    bins[bin] += segment.length;
    total += segment.length;
  }
  return bins.map(value => total ? round(value / total) : 0);
}

function buildLengthHistogram(segments, binCount) {
  const lengths = segments.map(segment => segment.length);
  const max = Math.max(...lengths, 1e-6);
  const bins = Array.from({ length: binCount }, () => 0);
  for (const length of lengths) {
    const bin = Math.min(binCount - 1, Math.floor((length / max) * binCount));
    bins[bin]++;
  }
  return bins.map(value => round(value / Math.max(segments.length, 1)));
}

function compareHistogram(a = [], b = []) {
  const length = Math.min(a.length, b.length);
  if (!length) return 0;
  const distance = Array.from({ length }, (_, index) => Math.abs((a[index] || 0) - (b[index] || 0))).reduce((sum, value) => sum + value, 0);
  return clampScore(100 * (1 - distance / 2));
}

function zoneBounds(column, row) {
  const width = 1 / GRID.columns;
  const height = 1 / GRID.rows;
  return {
    xMin: -0.5 + column * width,
    xMax: -0.5 + (column + 1) * width,
    yMin: -0.5 + row * height,
    yMax: -0.5 + (row + 1) * height
  };
}

function inBounds(point, bounds) {
  return point.x >= bounds.xMin && point.x < bounds.xMax && point.y >= bounds.yMin && point.y < bounds.yMax;
}

function totalLength(segments) {
  return segments.reduce((sum, segment) => sum + segment.length, 0) || 1;
}

function percentile(values, ratio) {
  const sorted = values.filter(value => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const index = Math.max(0, Math.min(sorted.length - 1, Math.floor(sorted.length * ratio)));
  return sorted[index];
}

function isHorizontal(angle) {
  return angle < Math.PI / 8 || angle > Math.PI * 7 / 8;
}

function isVertical(angle) {
  return Math.abs(angle - Math.PI / 2) < Math.PI / 8;
}

function normalizeHalfTurn(angle) {
  let value = Math.abs(angle) % Math.PI;
  if (value < 0) value += Math.PI;
  return value;
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function round(value) {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}
