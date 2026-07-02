const RADIAL_BINS = 64;

export function buildShapeFingerprint(profile) {
  const points = sampleSvgPath(profile.svgPath || profile.paths || '');
  const normalizedPoints = normalizePoints(points);
  const radial = buildRadialSignature(normalizedPoints, RADIAL_BINS);
  const angleHistogram = buildAngleHistogram(normalizedPoints, 16);

  const values = [
    normalize(profile.width, 200),
    normalize(profile.height, 200),
    normalize(profile.ratio, 10),
    normalize(profile.surface, 2000),
    normalize(profile.perimeter, 1000),
    ...radial
  ];

  return {
    version: '1.1',
    reference: profile.reference,
    values,
    descriptors: {
      radial,
      angleHistogram
    },
    summary: {
      width: profile.width,
      height: profile.height,
      ratio: profile.ratio,
      normalizedRatio: normalizeRatio(profile.ratio),
      surface: profile.surface,
      perimeter: profile.perimeter,
      pointCount: normalizedPoints.length
    }
  };
}

export function buildShapeDNA(profile) {
  const points = sampleSvgPath(profile.svgPath || profile.paths || '');
  const normalizedPoints = normalizePoints(points);
  const radial = buildRadialSignature(normalizedPoints, RADIAL_BINS);
  const angleHistogram = buildAngleHistogram(normalizedPoints, 16);

  return {
    version: '1.1',
    identity: {
      reference: profile.reference,
      designation: profile.designation,
      collection: 'local'
    },
    globalShape: {
      width: profile.width,
      height: profile.height,
      ratio: profile.ratio,
      normalizedRatio: normalizeRatio(profile.ratio),
      surface: profile.surface,
      perimeter: profile.perimeter
    },
    topology: {
      contourCount: 1,
      holeCount: countSubPaths(profile.svgPath || profile.paths || '') - 1,
      componentCount: 1
    },
    contour: {
      normalizedPoints,
      simplifiedPoints: simplifyPoints(normalizedPoints, 0.01)
    },
    descriptors: {
      hu: [],
      fourier: [],
      radial,
      angleHistogram
    },
    quality: {
      source: 'svg',
      confidence: normalizedPoints.length ? 1 : 0.2,
      warnings: normalizedPoints.length ? [] : ['SVG path non echantillonne.']
    }
  };
}

export function buildDetectedFingerprintFromBox(object) {
  const ratio = object.width / object.height;
  const points = rectanglePoints(object.width, object.height);
  const normalizedPoints = normalizePoints(points);
  return {
    version: '1.1',
    reference: 'detected',
    descriptors: {
      radial: buildRadialSignature(normalizedPoints, RADIAL_BINS),
      angleHistogram: buildAngleHistogram(normalizedPoints, 16)
    },
    summary: {
      width: object.width,
      height: object.height,
      ratio,
      normalizedRatio: normalizeRatio(ratio),
      surface: object.area || 0,
      perimeter: 2 * (object.width + object.height),
      fillRatio: object.area ? object.area / (object.width * object.height) : 0,
      pointCount: normalizedPoints.length
    }
  };
}

function sampleSvgPath(pathText) {
  const tokens = tokenizePath(pathText);
  const points = [];
  let index = 0;
  let command = '';
  let current = { x: 0, y: 0 };
  let start = { x: 0, y: 0 };

  while (index < tokens.length) {
    if (isCommand(tokens[index])) command = tokens[index++];
    const upper = command.toUpperCase();
    const relative = command !== upper;

    if (upper === 'M') {
      const x = readNumber(tokens, index++);
      const y = readNumber(tokens, index++);
      current = resolvePoint(x, y, current, relative);
      start = current;
      points.push(current);
      command = relative ? 'l' : 'L';
      continue;
    }

    if (upper === 'L') {
      const x = readNumber(tokens, index++);
      const y = readNumber(tokens, index++);
      const next = resolvePoint(x, y, current, relative);
      pushLine(points, current, next, 8);
      current = next;
      continue;
    }

    if (upper === 'H') {
      const x = readNumber(tokens, index++);
      const next = { x: relative ? current.x + x : x, y: current.y };
      pushLine(points, current, next, 8);
      current = next;
      continue;
    }

    if (upper === 'V') {
      const y = readNumber(tokens, index++);
      const next = { x: current.x, y: relative ? current.y + y : y };
      pushLine(points, current, next, 8);
      current = next;
      continue;
    }

    if (upper === 'A') {
      const rx = readNumber(tokens, index++);
      const ry = readNumber(tokens, index++);
      index += 3;
      const x = readNumber(tokens, index++);
      const y = readNumber(tokens, index++);
      const next = resolvePoint(x, y, current, relative);
      pushLine(points, current, next, Math.max(6, Math.ceil((Math.abs(rx) + Math.abs(ry)) / 2)));
      current = next;
      continue;
    }

    if (upper === 'Z') {
      pushLine(points, current, start, 8);
      current = start;
      command = '';
      continue;
    }

    index++;
  }

  return points;
}

function tokenizePath(pathText) {
  return String(pathText).match(/[AaCcHhLlMmQqSsTtVvZz]|[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g) || [];
}

function isCommand(value) {
  return /^[A-Za-z]$/.test(value);
}

function readNumber(tokens, index) {
  const value = Number(tokens[index]);
  return Number.isFinite(value) ? value : 0;
}

function resolvePoint(x, y, current, relative) {
  return relative ? { x: current.x + x, y: current.y + y } : { x, y };
}

function pushLine(points, a, b, steps) {
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    points.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
}

function normalizePoints(points) {
  if (!points.length) return [];
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
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const scale = Math.max(maxX - minX, maxY - minY) || 1;
  return points.map(point => ({ x: (point.x - cx) / scale, y: (point.y - cy) / scale }));
}

function buildRadialSignature(points, binCount) {
  const bins = Array.from({ length: binCount }, () => 0);
  const counts = Array.from({ length: binCount }, () => 0);
  for (const point of points) {
    const angle = Math.atan2(point.y, point.x);
    const distance = Math.hypot(point.x, point.y);
    const bin = Math.floor((((angle + Math.PI) / (Math.PI * 2)) * binCount)) % binCount;
    bins[bin] += distance;
    counts[bin]++;
  }
  const radial = bins.map((value, index) => counts[index] ? value / counts[index] : 0);
  const max = Math.max(...radial, 1);
  return radial.map(value => value / max);
}

function buildAngleHistogram(points, binCount) {
  const bins = Array.from({ length: binCount }, () => 0);
  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1];
    const point = points[i];
    const angle = Math.atan2(point.y - previous.y, point.x - previous.x);
    const bin = Math.floor((((angle + Math.PI) / (Math.PI * 2)) * binCount)) % binCount;
    bins[bin]++;
  }
  const total = bins.reduce((sum, value) => sum + value, 0) || 1;
  return bins.map(value => value / total);
}

function simplifyPoints(points, tolerance) {
  if (points.length <= 2) return points;
  const output = [points[0]];
  let last = points[0];
  for (let i = 1; i < points.length - 1; i++) {
    if (Math.hypot(points[i].x - last.x, points[i].y - last.y) >= tolerance) {
      output.push(points[i]);
      last = points[i];
    }
  }
  output.push(points[points.length - 1]);
  return output;
}

function rectanglePoints(width, height) {
  const points = [];
  pushLine(points, { x: 0, y: 0 }, { x: width, y: 0 }, 16);
  pushLine(points, { x: width, y: 0 }, { x: width, y: height }, 16);
  pushLine(points, { x: width, y: height }, { x: 0, y: height }, 16);
  pushLine(points, { x: 0, y: height }, { x: 0, y: 0 }, 16);
  return points;
}

function countSubPaths(pathText) {
  return (String(pathText).match(/[Mm]/g) || []).length || 1;
}

function normalizeRatio(ratio) {
  if (!Number.isFinite(ratio) || ratio <= 0) return 1;
  return ratio >= 1 ? ratio : 1 / ratio;
}

function normalize(value, max) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value / max));
}
