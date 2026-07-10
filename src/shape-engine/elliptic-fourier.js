import { registerAlgorithm } from '../observability/algorithm-registry.js';

export function buildEllipticFourierDescriptor(contours, options = {}) {
  const harmonicCount = positiveInteger(options.harmonics, 12);
  const contour = selectLongestClosedContour(contours);
  const points = closeContour(contour?.points || contour || []);

  if (points.length < 4) {
    return {
      version: 'efd-energy-v1',
      harmonics: harmonicCount,
      values: Array.from({ length: harmonicCount }, () => 0),
      coefficients: [],
      quality: { valid: false, reason: 'contour-insufficient' }
    };
  }

  const segments = buildSegments(points);
  const totalLength = segments.reduce((sum, segment) => sum + segment.length, 0);
  if (!totalLength) {
    return {
      version: 'efd-energy-v1',
      harmonics: harmonicCount,
      values: Array.from({ length: harmonicCount }, () => 0),
      coefficients: [],
      quality: { valid: false, reason: 'zero-perimeter' }
    };
  }

  const coefficients = [];
  for (let harmonic = 1; harmonic <= harmonicCount; harmonic++) {
    coefficients.push(computeHarmonic(segments, totalLength, harmonic));
  }

  const firstEnergy = coefficientEnergy(coefficients[0]) || 1;
  const values = coefficients.map(coefficient => coefficientEnergy(coefficient) / firstEnergy);

  return {
    version: 'efd-energy-v1',
    harmonics: harmonicCount,
    values,
    coefficients,
    quality: {
      valid: true,
      pointCount: points.length,
      perimeter: totalLength,
      normalization: 'translation-free-scale-normalized-energy'
    }
  };
}

export function compareEllipticFourier(left, right) {
  const leftValues = descriptorValues(left);
  const rightValues = descriptorValues(right);
  const count = Math.min(leftValues.length, rightValues.length);
  if (!count) return 0;

  let squaredError = 0;
  let referenceEnergy = 0;
  for (let index = 0; index < count; index++) {
    const delta = leftValues[index] - rightValues[index];
    squaredError += delta * delta;
    referenceEnergy += leftValues[index] * leftValues[index] + rightValues[index] * rightValues[index];
  }

  const normalizedDistance = Math.sqrt(squaredError / Math.max(referenceEnergy, 1e-12));
  return clamp((1 - normalizedDistance) * 100, 0, 100);
}

registerAlgorithm({
  id: 'efd',
  label: 'Elliptic Fourier Descriptors',
  version: '1.0.0',
  stage: 'descriptor',
  status: 'experimental',
  requires: ['normalized-contours'],
  produces: ['efd-signature'],
  tags: ['contour', 'fourier', 'experimental', 'rotation-tolerant', 'scale-invariant'],
  description: 'Signature harmonique de contour fermee, normalisee en energie.',
  compute: ({ input, context }) => buildEllipticFourierDescriptor(
    input['normalized-contours'],
    { harmonics: context?.settings?.efdHarmonics || 12 }
  ),
  compare: compareEllipticFourier
});

function computeHarmonic(segments, totalLength, harmonic) {
  const omega = 2 * Math.PI * harmonic / totalLength;
  const factor = totalLength / (2 * Math.PI * Math.PI * harmonic * harmonic);
  let a = 0;
  let b = 0;
  let c = 0;
  let d = 0;

  for (const segment of segments) {
    if (!segment.length) continue;
    const dxdt = segment.dx / segment.length;
    const dydt = segment.dy / segment.length;
    const cosEnd = Math.cos(omega * segment.endLength);
    const cosStart = Math.cos(omega * segment.startLength);
    const sinEnd = Math.sin(omega * segment.endLength);
    const sinStart = Math.sin(omega * segment.startLength);

    a += dxdt * (cosEnd - cosStart);
    b += dxdt * (sinEnd - sinStart);
    c += dydt * (cosEnd - cosStart);
    d += dydt * (sinEnd - sinStart);
  }

  return {
    harmonic,
    a: factor * a,
    b: factor * b,
    c: factor * c,
    d: factor * d
  };
}

function buildSegments(points) {
  const segments = [];
  let cumulative = 0;

  for (let index = 1; index < points.length; index++) {
    const start = points[index - 1];
    const end = points[index];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    segments.push({
      dx,
      dy,
      length,
      startLength: cumulative,
      endLength: cumulative + length
    });
    cumulative += length;
  }

  return segments;
}

function selectLongestClosedContour(contours) {
  const normalized = normalizeContours(contours);
  return normalized.sort((left, right) => contourLength(right.points) - contourLength(left.points))[0] || null;
}

function normalizeContours(value) {
  if (!Array.isArray(value)) return [];
  if (value.length && value[0]?.points) return value;
  return [{ points: value, closed: true }];
}

function closeContour(points) {
  const output = (points || [])
    .map(point => ({ x: Number(point.x), y: Number(point.y) }))
    .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (output.length < 2) return output;

  const first = output[0];
  const last = output.at(-1);
  return samePoint(first, last) ? output : [...output, { ...first }];
}

function contourLength(points = []) {
  const closed = closeContour(points);
  let total = 0;
  for (let index = 1; index < closed.length; index++) {
    total += Math.hypot(closed[index].x - closed[index - 1].x, closed[index].y - closed[index - 1].y);
  }
  return total;
}

function coefficientEnergy(coefficient) {
  if (!coefficient) return 0;
  return Math.hypot(coefficient.a, coefficient.b, coefficient.c, coefficient.d);
}

function descriptorValues(value) {
  if (Array.isArray(value)) return value.map(Number).filter(Number.isFinite);
  return Array.isArray(value?.values) ? value.values.map(Number).filter(Number.isFinite) : [];
}

function samePoint(left, right) {
  return left.x === right.x && left.y === right.y;
}

function positiveInteger(value, fallback) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
