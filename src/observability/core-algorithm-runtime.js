import { attachAlgorithmRuntime } from './algorithm-registry.js';
import { buildLocalFeatureSignature } from '../shape-engine/local-feature-signature.js';
import { buildMinutiaeSignature } from '../shape-engine/minutiae-signature.js';

attachAlgorithmRuntime('ratio', {
  compute: ({ input }) => {
    const geometry = input.geometry || {};
    const width = Number(geometry.width);
    const height = Number(geometry.height);
    const raw = Number(geometry.ratio);
    const ratio = Number.isFinite(raw) ? raw : (Number.isFinite(width / height) ? width / height : 0);
    return ratio;
  }
});

attachAlgorithmRuntime('radial', {
  compute: ({ input, context }) => {
    const points = flattenPoints(input['normalized-contours']);
    const binCount = positiveInteger(context?.settings?.radialBins, 64);
    return buildRadialSignature(points, binCount);
  }
});

attachAlgorithmRuntime('angle', {
  compute: ({ input, context }) => {
    const contours = normalizeContourInput(input['normalized-contours']);
    const binCount = positiveInteger(context?.settings?.angleBins, 16);
    return buildAngleHistogram(contours, binCount);
  }
});

attachAlgorithmRuntime('fourier', {
  compute: ({ input, context }) => {
    const contours = normalizeContourInput(input['normalized-contours']);
    const terms = positiveInteger(context?.settings?.fourierTerms, 16);
    return buildFourierDescriptor(longestContour(contours), terms);
  }
});

attachAlgorithmRuntime('minutiae', {
  compute: ({ input }) => buildMinutiaeSignature(flattenPoints(input['normalized-contours']))
});

attachAlgorithmRuntime('localFeature', {
  compute: ({ input }) => buildLocalFeatureSignature(flattenPoints(input['normalized-contours']))
});

attachAlgorithmRuntime('fill', {
  compute: ({ input }) => {
    const mask = input['filled-mask'];
    if (Number.isFinite(Number(mask?.fillRatio))) return Number(mask.fillRatio);
    if (Array.isArray(mask)) {
      const filled = mask.reduce((sum, value) => sum + (value ? 1 : 0), 0);
      return mask.length ? filled / mask.length : 0;
    }
    return 0;
  }
});

function buildRadialSignature(points, binCount) {
  const bins = Array.from({ length: binCount }, () => 0);
  const counts = Array.from({ length: binCount }, () => 0);

  for (const point of points) {
    const angle = Math.atan2(point.y, point.x);
    const distance = Math.hypot(point.x, point.y);
    const bin = Math.floor((((angle + Math.PI) / (Math.PI * 2)) * binCount)) % binCount;
    bins[bin] += distance;
    counts[bin] += 1;
  }

  const radial = bins.map((value, index) => counts[index] ? value / counts[index] : 0);
  const max = Math.max(...radial, 1);
  return radial.map(value => value / max);
}

function buildAngleHistogram(contours, binCount) {
  const bins = Array.from({ length: binCount }, () => 0);

  for (const contour of contours) {
    const points = contour.points || [];
    for (let index = 1; index < points.length; index++) {
      const previous = points[index - 1];
      const point = points[index];
      const angle = Math.atan2(point.y - previous.y, point.x - previous.x);
      const bin = Math.floor((((angle + Math.PI) / (Math.PI * 2)) * binCount)) % binCount;
      bins[bin] += 1;
    }
  }

  const total = bins.reduce((sum, value) => sum + value, 0) || 1;
  return bins.map(value => value / total);
}

function buildFourierDescriptor(contour, termCount) {
  const points = contour?.points || [];
  if (points.length < 3) return Array.from({ length: termCount }, () => 0);

  const samples = resampleClosed(points, Math.max(32, termCount * 4));
  const coefficients = [];

  for (let harmonic = 1; harmonic <= termCount; harmonic++) {
    let real = 0;
    let imaginary = 0;
    for (let index = 0; index < samples.length; index++) {
      const point = samples[index];
      const angle = -2 * Math.PI * harmonic * index / samples.length;
      const x = point.x;
      const y = point.y;
      real += x * Math.cos(angle) - y * Math.sin(angle);
      imaginary += x * Math.sin(angle) + y * Math.cos(angle);
    }
    coefficients.push(Math.hypot(real, imaginary) / samples.length);
  }

  const energy = Math.hypot(...coefficients) || 1;
  return coefficients.map(value => value / energy);
}

function resampleClosed(points, targetCount) {
  const closed = closePoints(points);
  if (closed.length <= 2) return closed;

  const segments = [];
  let totalLength = 0;
  for (let index = 1; index < closed.length; index++) {
    const start = closed[index - 1];
    const end = closed[index];
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    segments.push({ start, end, length, offset: totalLength });
    totalLength += length;
  }

  if (!totalLength) return closed.slice(0, targetCount);
  const output = [];
  for (let index = 0; index < targetCount; index++) {
    const distance = totalLength * index / targetCount;
    const segment = segments.find(item => distance <= item.offset + item.length) || segments.at(-1);
    const ratio = segment.length ? (distance - segment.offset) / segment.length : 0;
    output.push({
      x: segment.start.x + (segment.end.x - segment.start.x) * ratio,
      y: segment.start.y + (segment.end.y - segment.start.y) * ratio
    });
  }
  return output;
}

function longestContour(contours) {
  return [...contours].sort((left, right) => contourLength(right.points) - contourLength(left.points))[0] || { points: [] };
}

function contourLength(points = []) {
  let total = 0;
  for (let index = 1; index < points.length; index++) {
    total += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
  }
  return total;
}

function normalizeContourInput(value) {
  if (!Array.isArray(value)) return [];
  if (value.length && value[0]?.points) return value;
  return [{ points: value }];
}

function flattenPoints(value) {
  return normalizeContourInput(value)
    .flatMap(contour => contour.points || [])
    .map(point => ({ x: Number(point.x), y: Number(point.y) }))
    .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
}

function closePoints(points) {
  const output = points.map(point => ({ x: Number(point.x), y: Number(point.y) }));
  if (output.length < 2) return output;
  const first = output[0];
  const last = output.at(-1);
  return first.x === last.x && first.y === last.y ? output : [...output, { ...first }];
}

function positiveInteger(value, fallback) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}
