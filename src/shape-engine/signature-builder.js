import { normalizePipelineSettings } from './pipeline-settings.js';

export function buildShapeFingerprint(profile, pipelineSettings = {}) {
  const settings = normalizePipelineSettings(pipelineSettings);
  const points = sampleSvgPath(profile.svgPath || profile.paths || '');
  return buildFingerprint({
    reference: profile.reference,
    width: profile.width,
    height: profile.height,
    ratio: profile.ratio,
    surface: profile.surface,
    perimeter: profile.perimeter,
    points,
    source: 'svg',
    pipelineSettings: settings
  });
}

export function buildShapeDNA(profile, pipelineSettings = {}) {
  const settings = normalizePipelineSettings(pipelineSettings);
  const points = sampleSvgPath(profile.svgPath || profile.paths || '');
  const fingerprint = buildShapeFingerprint(profile, settings);
  const normalizedPoints = normalizePoints(points);

  return {
    version: '1.4',
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
      simplifiedPoints: simplifyPoints(normalizedPoints, settings.simplifyEpsilon)
    },
    descriptors: fingerprint.descriptors,
    pipelineSettings: settings,
    quality: {
      source: 'svg',
      confidence: normalizedPoints.length ? 1 : 0.2,
      warnings: normalizedPoints.length ? [] : ['SVG path non echantillonne.']
    }
  };
}

export function buildDetectedFingerprintFromBox(object, pipelineSettings = {}) {
  return buildDetectedFingerprintFromPoints({
    ...object,
    points: rectanglePoints(object.width, object.height)
  }, pipelineSettings);
}

export function buildDetectedFingerprintFromPoints(object, pipelineSettings = {}) {
  const settings = normalizePipelineSettings(pipelineSettings);
  const ratio = object.width / object.height;
  return buildFingerprint({
    reference: 'detected',
    width: object.width,
    height: object.height,
    ratio,
    surface: object.area || 0,
    perimeter: object.perimeter || 2 * (object.width + object.height),
    fillRatio: object.area ? object.area / (object.width * object.height) : 0,
    points: object.points?.length ? object.points : rectanglePoints(object.width, object.height),
    source: object.points?.length ? 'contour' : 'box',
    pipelineSettings: settings
  });
}

function buildFingerprint({ reference, width, height, ratio, surface, perimeter, fillRatio = 0, points, source, pipelineSettings }) {
  const settings = normalizePipelineSettings(pipelineSettings);
  const normalizedPoints = normalizePoints(points || []);
  const compactPoints = simplifyPoints(normalizedPoints, settings.simplifyEpsilon).slice(0, settings.contourPointCount);
  const filledShape = buildFilledShape(normalizedPoints, settings.fillGridSize);
  const radial = buildRadialSignature(normalizedPoints, settings.radialBins);
  const angleHistogram = buildAngleHistogram(normalizedPoints, settings.angleBins);
  const hu = buildHuMoments(filledShape.points.length ? filledShape.points : normalizedPoints);
  const fourier = buildFourierDescriptor(normalizedPoints, settings.fourierTerms);
  const effectiveFillRatio = filledShape.fillRatio || fillRatio;
  const values = [
    normalize(width, 200),
    normalize(height, 200),
    normalize(ratio, 10),
    normalize(surface, 2000),
    normalize(perimeter, 1000),
    ...radial,
    ...hu,
    ...fourier
  ];

  return {
    version: '1.6',
    reference,
    values,
    contour: {
      normalizedPoints: compactPoints
    },
    descriptors: { radial, angleHistogram, hu, fourier, points: compactPoints },
    pipelineSettings: settings,
    summary: {
      width,
      height,
      ratio,
      normalizedRatio: normalizeRatio(ratio),
      surface,
      perimeter,
      fillRatio: effectiveFillRatio,
      pointCount: normalizedPoints.length,
      source,
      huSource: filledShape.points.length ? settings.huSource : 'contour',
      pipelineVersion: settings.version
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

function buildFilledShape(points, gridSize) {
  if (points.length < 3) return { points: [], fillRatio: 0 };
  const output = [];
  const step = 1 / gridSize;
  const start = -0.5 + step / 2;

  for (let yIndex = 0; yIndex < gridSize; yIndex++) {
    const y = start + yIndex * step;
    for (let xIndex = 0; xIndex < gridSize; xIndex++) {
      const x = start + xIndex * step;
      if (isPointInsidePolygon(x, y, points)) output.push({ x, y });
    }
  }

  return {
    points: output,
    fillRatio: output.length / (gridSize * gridSize)
  };
}

function isPointInsidePolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i];
    const b = points[j];
    const crosses = (a.y > y) !== (b.y > y);
    if (crosses) {
      const atX = ((b.x - a.x) * (y - a.y)) / ((b.y - a.y) || 1e-12) + a.x;
      if (x < atX) inside = !inside;
    }
  }
  return inside;
}

function buildHuMoments(points) {
  if (!points.length) return Array.from({ length: 7 }, () => 0);
  const raw = momentSet(points);
  const cx = raw.m10 / raw.m00;
  const cy = raw.m01 / raw.m00;
  const mu20 = centralMoment(points, cx, cy, 2, 0);
  const mu02 = centralMoment(points, cx, cy, 0, 2);
  const mu11 = centralMoment(points, cx, cy, 1, 1);
  const mu30 = centralMoment(points, cx, cy, 3, 0);
  const mu03 = centralMoment(points, cx, cy, 0, 3);
  const mu21 = centralMoment(points, cx, cy, 2, 1);
  const mu12 = centralMoment(points, cx, cy, 1, 2);
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
  const h5 = (n30 - 3 * n12) * (n30 + n12) * ((n30 + n12) ** 2 - 3 * (n21 + n03) ** 2) + (3 * n21 - n03) * (n21 + n03) * (3 * (n30 + n12) ** 2 - (n21 + n03) ** 2);
  const h6 = (n20 - n02) * ((n30 + n12) ** 2 - (n21 + n03) ** 2) + 4 * n11 * (n30 + n12) * (n21 + n03);
  const h7 = (3 * n21 - n03) * (n30 + n12) * ((n30 + n12) ** 2 - 3 * (n21 + n03) ** 2) - (n30 - 3 * n12) * (n21 + n03) * (3 * (n30 + n12) ** 2 - (n21 + n03) ** 2);
  return [h1, h2, h3, h4, h5, h6, h7].map(value => Math.sign(value) * Math.log10(Math.abs(value) + 1e-30));
}

function momentSet(points) {
  return points.reduce((sum, point) => ({
    m00: sum.m00 + 1,
    m10: sum.m10 + point.x,
    m01: sum.m01 + point.y
  }), { m00: 0, m10: 0, m01: 0 });
}

function centralMoment(points, cx, cy, p, q) {
  return points.reduce((sum, point) => sum + (point.x - cx) ** p * (point.y - cy) ** q, 0);
}

function eta(mu, m00, p, q) {
  return mu / (m00 ** (1 + (p + q) / 2));
}

function buildFourierDescriptor(points, terms) {
  if (!points.length) return Array.from({ length: terms }, () => 0);
  const values = [];
  for (let k = 1; k <= terms; k++) {
    let real = 0;
    let imaginary = 0;
    for (let n = 0; n < points.length; n++) {
      const angle = (-2 * Math.PI * k * n) / points.length;
      real += points[n].x * Math.cos(angle) - points[n].y * Math.sin(angle);
      imaginary += points[n].x * Math.sin(angle) + points[n].y * Math.cos(angle);
    }
    values.push(Math.hypot(real, imaginary) / points.length);
  }
  const base = values[0] || 1;
  return values.map(value => value / base);
}

function rectanglePoints(width, height) {
  return [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height }
  ];
}

function simplifyPoints(points, epsilon) {
  if (points.length <= 3) return points;
  const output = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const previous = output[output.length - 1];
    const point = points[i];
    if (Math.hypot(point.x - previous.x, point.y - previous.y) >= epsilon) output.push(point);
  }
  return output;
}

function countSubPaths(pathText) {
  return (String(pathText).match(/[Mm]/g) || []).length;
}

function normalize(value, scale) {
  return Number.isFinite(value) ? value / scale : 0;
}

function normalizeRatio(ratio) {
  if (!Number.isFinite(ratio) || ratio <= 0) return 0;
  return Math.log(ratio);
}
