export function buildProfileMinutiae(points) {
  const clean = normalizeInput(points);
  if (clean.length < 8) return emptyMinutiae();

  const corners = [];
  const endings = [];
  const straightRuns = [];
  const angleBins = Array.from({ length: 8 }, () => 0);
  const radiusBins = Array.from({ length: 6 }, () => 0);
  const turnSigns = { positive: 0, negative: 0, neutral: 0 };

  let currentRun = 1;
  for (let index = 1; index < clean.length - 1; index++) {
    const previous = clean[index - 1];
    const point = clean[index];
    const next = clean[index + 1];
    const a1 = Math.atan2(point.y - previous.y, point.x - previous.x);
    const a2 = Math.atan2(next.y - point.y, next.x - point.x);
    const turn = normalizeAngle(a2 - a1);
    const absTurn = Math.abs(turn);

    if (absTurn < 0.12) currentRun++;
    else {
      if (currentRun >= 4) straightRuns.push(currentRun);
      currentRun = 1;
    }

    if (absTurn >= 0.42) {
      const type = absTurn > 1.35 ? 'sharp-corner' : 'corner';
      corners.push({ x: round(point.x), y: round(point.y), angle: round(absTurn), type });
      const angleBin = Math.floor(((Math.atan2(point.y, point.x) + Math.PI) / (Math.PI * 2)) * angleBins.length) % angleBins.length;
      const radiusBin = Math.min(radiusBins.length - 1, Math.floor(Math.hypot(point.x, point.y) * 2 * radiusBins.length));
      angleBins[angleBin]++;
      radiusBins[radiusBin]++;
    }

    if (turn > 0.12) turnSigns.positive++;
    else if (turn < -0.12) turnSigns.negative++;
    else turnSigns.neutral++;
  }
  if (currentRun >= 4) straightRuns.push(currentRun);

  if (distance(clean[0], clean[clean.length - 1]) > 0.08) {
    endings.push({ x: round(clean[0].x), y: round(clean[0].y), type: 'ending' });
    endings.push({ x: round(clean[clean.length - 1].x), y: round(clean[clean.length - 1].y), type: 'ending' });
  }

  const normalizedAngleBins = normalizeBins(angleBins);
  const normalizedRadiusBins = normalizeBins(radiusBins);
  const runStats = summarizeRuns(straightRuns, clean.length);
  const density = corners.length / Math.max(1, clean.length);
  const branchLike = estimateBranchLike(corners);
  const islands = estimateIslandLike(corners, straightRuns, clean.length);

  return {
    version: 'profile-minutiae-v1',
    summary: {
      cornerCount: corners.length,
      sharpCornerCount: corners.filter(point => point.type === 'sharp-corner').length,
      endingCount: endings.length,
      branchLikeCount: branchLike,
      islandLikeCount: islands,
      straightRunCount: straightRuns.length,
      meanStraightRun: round(runStats.mean),
      maxStraightRun: round(runStats.max),
      cornerDensity: round(density),
      turnBalance: round((turnSigns.positive - turnSigns.negative) / Math.max(1, turnSigns.positive + turnSigns.negative))
    },
    histogram: {
      angle: normalizedAngleBins,
      radius: normalizedRadiusBins,
      straightRuns: runStats.histogram
    },
    points: corners.slice(0, 80),
    endings
  };
}

export function minutiaeScore(a, b) {
  if (!a || !b) return 0;
  const summaryScore = compareSummary(a.summary, b.summary);
  const angleScore = compareCircular(a.histogram?.angle, b.histogram?.angle);
  const radiusScore = compareVector(a.histogram?.radius, b.histogram?.radius);
  const runScore = compareVector(a.histogram?.straightRuns, b.histogram?.straightRuns);
  const pointScore = comparePointCloud(a.points, b.points);
  return clamp(summaryScore * 0.28 + angleScore * 0.24 + radiusScore * 0.16 + runScore * 0.12 + pointScore * 0.20, 0, 100);
}

function compareSummary(a = {}, b = {}) {
  const keys = [
    ['cornerCount', 26],
    ['sharpCornerCount', 12],
    ['endingCount', 4],
    ['branchLikeCount', 10],
    ['islandLikeCount', 10],
    ['straightRunCount', 18],
    ['cornerDensity', 0.45],
    ['turnBalance', 2]
  ];
  let sum = 0;
  for (const [key, scale] of keys) {
    sum += 100 * (1 - Math.min(1, Math.abs((Number(a[key]) || 0) - (Number(b[key]) || 0)) / scale));
  }
  return sum / keys.length;
}

function compareCircular(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || !b.length) return 0;
  const length = Math.min(a.length, b.length);
  let best = 0;
  for (let shift = 0; shift < length; shift++) {
    let score = 0;
    for (let index = 0; index < length; index++) {
      score += 1 - Math.min(1, Math.abs((a[index] || 0) - (b[(index + shift) % length] || 0)));
    }
    best = Math.max(best, (score / length) * 100);
  }
  return best;
}

function compareVector(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || !b.length) return 0;
  const length = Math.min(a.length, b.length);
  let score = 0;
  for (let index = 0; index < length; index++) score += 1 - Math.min(1, Math.abs((a[index] || 0) - (b[index] || 0)));
  return (score / length) * 100;
}

function comparePointCloud(a = [], b = []) {
  if (!a.length || !b.length) return 50;
  const forward = directedPointScore(a, b);
  const backward = directedPointScore(b, a);
  return (forward + backward) / 2;
}

function directedPointScore(a, b) {
  let sum = 0;
  for (const point of a) {
    let best = Infinity;
    for (const target of b) best = Math.min(best, distance(point, target));
    sum += 100 * (1 - Math.min(1, best / 0.18));
  }
  return sum / a.length;
}

function normalizeInput(points) {
  return (points || [])
    .filter(point => Number.isFinite(point?.x) && Number.isFinite(point?.y))
    .map(point => ({ x: Number(point.x), y: Number(point.y) }));
}

function normalizeAngle(angle) {
  let value = angle;
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

function normalizeBins(values) {
  const total = values.reduce((sum, value) => sum + value, 0) || 1;
  return values.map(value => round(value / total));
}

function summarizeRuns(runs, totalPoints) {
  const max = Math.max(...runs, 0) / Math.max(1, totalPoints);
  const mean = runs.length ? runs.reduce((sum, value) => sum + value, 0) / runs.length / Math.max(1, totalPoints) : 0;
  const histogram = Array.from({ length: 5 }, () => 0);
  for (const run of runs) {
    const ratio = run / Math.max(1, totalPoints);
    const bin = Math.min(histogram.length - 1, Math.floor(ratio * 18));
    histogram[bin]++;
  }
  return { max, mean, histogram: normalizeBins(histogram) };
}

function estimateBranchLike(corners) {
  let count = 0;
  for (let i = 0; i < corners.length; i++) {
    for (let j = i + 1; j < corners.length; j++) {
      if (distance(corners[i], corners[j]) < 0.055) count++;
    }
  }
  return Math.min(20, count);
}

function estimateIslandLike(corners, straightRuns, totalPoints) {
  const manySmallCorners = corners.length > 18 ? 1 : 0;
  const fragmented = straightRuns.length > totalPoints / 18 ? 1 : 0;
  return manySmallCorners + fragmented;
}

function emptyMinutiae() {
  return {
    version: 'profile-minutiae-v1',
    summary: { cornerCount: 0, sharpCornerCount: 0, endingCount: 0, branchLikeCount: 0, islandLikeCount: 0, straightRunCount: 0, meanStraightRun: 0, maxStraightRun: 0, cornerDensity: 0, turnBalance: 0 },
    histogram: { angle: [], radius: [], straightRuns: [] },
    points: [],
    endings: []
  };
}

function distance(a, b) {
  return Math.hypot((a.x || 0) - (b.x || 0), (a.y || 0) - (b.y || 0));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value) {
  return Math.round(value * 1000000) / 1000000;
}
