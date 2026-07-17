import { buildAngleHistogram } from './angle-signature.js';
import { buildFilledShape } from './filled-shape.js';
import { buildLocalFeatureSignature } from './local-feature-signature.js';
import { buildMinutiaeSignature } from './minutiae-signature.js';
import { normalizePipelineSettings } from './pipeline-settings.js';
import { buildRadialSignature } from './radial-signature.js';
import { sampleSvgPathContours } from './svg-path-sampler.js';
import {
  flattenContours,
  longestContour,
  normalizeContours,
  rectanglePoints,
  resampleContours,
  simplifyPoints
} from './contour-utils.js';

export function buildProfileFingerprintCore(profile, pipelineSettings = {}) {
  const settings = normalizePipelineSettings(pipelineSettings);
  const contours = sampleSvgPathContours(profile.svgPath || profile.paths || '', {
    maxSegmentLength: settings.sampleMaxSegmentLength
  });
  return buildFingerprint({
    reference: profile.reference,
    width: profile.width,
    height: profile.height,
    ratio: profile.ratio,
    surface: profile.surface,
    perimeter: profile.perimeter,
    contours,
    source: 'svg',
    pipelineSettings: settings
  });
}

export function buildProfileDNACore(profile, pipelineSettings = {}) {
  const settings = normalizePipelineSettings(pipelineSettings);
  const contours = sampleSvgPathContours(profile.svgPath || profile.paths || '', {
    maxSegmentLength: settings.sampleMaxSegmentLength
  });
  const fingerprint = buildProfileFingerprintCore(profile, settings);
  const normalizedContours = normalizeContours(contours);
  const normalizedPoints = flattenContours(normalizedContours);

  return {
    version: '1.6',
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
      fillRule: 'evenodd',
      contourCount: normalizedContours.length || 1,
      holeCount: Math.max(0, normalizedContours.length - 1),
      componentCount: 1
    },
    contour: {
      contours: normalizedContours,
      normalizedPoints,
      simplifiedPoints: simplifyPoints(normalizedPoints, settings.simplifyEpsilon)
    },
    descriptors: fingerprint.descriptors,
    pipelineSettings: settings,
    quality: {
      source: 'svg-contours',
      confidence: normalizedPoints.length ? 1 : 0.2,
      warnings: normalizedPoints.length ? [] : ['SVG path non echantillonne.']
    }
  };
}

export function buildDetectedBoxFingerprintCore(object, pipelineSettings = {}) {
  return buildDetectedFingerprintCore({
    ...object,
    contours: [{
      points: rectanglePoints(object.width, object.height),
      closed: true
    }]
  }, pipelineSettings);
}

export function buildDetectedFingerprintCore(object, pipelineSettings = {}) {
  const settings = normalizePipelineSettings(pipelineSettings);
  const ratio = object.width / object.height;
  const contours = object.contours?.length
    ? object.contours
    : [{
      points: object.points?.length
        ? object.points
        : rectanglePoints(object.width, object.height),
      closed: true
    }];

  return buildFingerprint({
    reference: 'detected',
    width: object.width,
    height: object.height,
    ratio,
    surface: object.area || 0,
    perimeter: object.perimeter || 2 * (object.width + object.height),
    fillRatio: object.area ? object.area / (object.width * object.height) : 0,
    contours,
    source: object.points?.length || object.contours?.length ? 'contour' : 'box',
    pipelineSettings: settings
  });
}

function buildFingerprint({
  reference,
  width,
  height,
  ratio,
  surface,
  perimeter,
  fillRatio = 0,
  contours,
  source,
  pipelineSettings
}) {
  const settings = normalizePipelineSettings(pipelineSettings);
  const normalizedContours = normalizeContours(contours || []);
  const normalizedPoints = flattenContours(normalizedContours);
  const compactContours = resampleContours(
    normalizedContours,
    settings.contourPointCount,
    settings.simplifyEpsilon
  );
  const compactPoints = flattenContours(compactContours);
  const descriptorPoints = compactPoints.length ? compactPoints : normalizedPoints;
  const descriptorContours = compactContours.length
    ? compactContours
    : normalizedContours;
  const filledShape = buildFilledShape(normalizedContours, settings.fillGridSize);
  const radial = buildRadialSignature(normalizedPoints, settings.radialBins);
  const angleHistogram = buildAngleHistogram(descriptorContours, settings.angleBins);
  const hu = buildHuMoments(
    filledShape.points.length ? filledShape.points : normalizedPoints
  );
  const fourier = buildFourierDescriptor(
    longestContour(descriptorContours),
    settings.fourierTerms
  );
  const minutiae = buildMinutiaeSignature(descriptorPoints);
  const localFeature = buildLocalFeatureSignature(descriptorPoints);
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
    version: '2.2',
    reference,
    values,
    contour: {
      contours: compactContours,
      normalizedPoints: compactPoints,
      contourCount: compactContours.length,
      fillRule: 'evenodd'
    },
    descriptors: {
      radial,
      angleHistogram,
      hu,
      fourier,
      minutiae,
      localFeature,
      points: compactPoints,
      contours: compactContours
    },
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
      descriptorPointCount: compactPoints.length,
      contourCount: normalizedContours.length,
      fillRule: 'evenodd',
      source,
      huSource: filledShape.points.length ? settings.huSource : 'contour',
      pipelineVersion: settings.version,
      sampleMaxSegmentLength: settings.sampleMaxSegmentLength,
      fourierNormalization: 'arc-length-energy-v2'
    }
  };
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
  const h5 = (n30 - 3 * n12) * (n30 + n12) *
    ((n30 + n12) ** 2 - 3 * (n21 + n03) ** 2) +
    (3 * n21 - n03) * (n21 + n03) *
    (3 * (n30 + n12) ** 2 - (n21 + n03) ** 2);
  const h6 = (n20 - n02) *
    ((n30 + n12) ** 2 - (n21 + n03) ** 2) +
    4 * n11 * (n30 + n12) * (n21 + n03);
  const h7 = (3 * n21 - n03) * (n30 + n12) *
    ((n30 + n12) ** 2 - 3 * (n21 + n03) ** 2) -
    (n30 - 3 * n12) * (n21 + n03) *
    (3 * (n30 + n12) ** 2 - (n21 + n03) ** 2);

  return [h1, h2, h3, h4, h5, h6, h7].map(value =>
    Math.sign(value) * Math.log10(Math.abs(value) + 1e-30)
  );
}

function momentSet(points) {
  return points.reduce((sum, point) => ({
    m00: sum.m00 + 1,
    m10: sum.m10 + point.x,
    m01: sum.m01 + point.y
  }), { m00: 0, m10: 0, m01: 0 });
}

function centralMoment(points, cx, cy, p, q) {
  return points.reduce(
    (sum, point) => sum + (point.x - cx) ** p * (point.y - cy) ** q,
    0
  );
}

function eta(mu, m00, p, q) {
  return mu / (m00 ** (1 + (p + q) / 2));
}

function buildFourierDescriptor(points, terms) {
  const openPoints = removeClosingDuplicate(points || []);
  if (openPoints.length < 3) return Array.from({ length: terms }, () => 0);

  const sampleCount = Math.max(64, terms * 8);
  const sampled = resampleClosedByArcLength(openPoints, sampleCount);
  if (sampled.length < 3) return Array.from({ length: terms }, () => 0);

  const center = sampled.reduce(
    (sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }),
    { x: 0, y: 0 }
  );
  center.x /= sampled.length;
  center.y /= sampled.length;
  const centered = sampled.map(point => ({
    x: point.x - center.x,
    y: point.y - center.y
  }));

  const magnitudes = [];
  for (let harmonic = 1; harmonic <= terms; harmonic++) {
    let real = 0;
    let imaginary = 0;
    for (let index = 0; index < centered.length; index++) {
      const angle = (-2 * Math.PI * harmonic * index) / centered.length;
      real += centered[index].x * Math.cos(angle) -
        centered[index].y * Math.sin(angle);
      imaginary += centered[index].x * Math.sin(angle) +
        centered[index].y * Math.cos(angle);
    }
    magnitudes.push(Math.hypot(real, imaginary) / centered.length);
  }

  const energy = Math.sqrt(
    magnitudes.reduce((sum, value) => sum + value * value, 0)
  );
  if (!Number.isFinite(energy) || energy < 1e-12) {
    return Array.from({ length: terms }, () => 0);
  }
  return magnitudes.map(value => value / energy);
}

function resampleClosedByArcLength(points, targetCount) {
  const source = removeClosingDuplicate(points);
  if (source.length < 2 || targetCount < 2) return source;

  const closed = [...source, source[0]];
  const cumulative = [0];
  for (let index = 1; index < closed.length; index++) {
    cumulative.push(
      cumulative[index - 1] +
      Math.hypot(
        closed[index].x - closed[index - 1].x,
        closed[index].y - closed[index - 1].y
      )
    );
  }

  const total = cumulative[cumulative.length - 1];
  if (!Number.isFinite(total) || total <= 1e-12) return [];

  const output = [];
  let segment = 1;
  for (let sampleIndex = 0; sampleIndex < targetCount; sampleIndex++) {
    const distance = total * sampleIndex / targetCount;
    while (
      segment < cumulative.length - 1 &&
      cumulative[segment] < distance
    ) segment++;

    const startDistance = cumulative[segment - 1];
    const endDistance = cumulative[segment];
    const ratio = endDistance > startDistance
      ? (distance - startDistance) / (endDistance - startDistance)
      : 0;
    const a = closed[segment - 1];
    const b = closed[segment];
    output.push({
      x: a.x + (b.x - a.x) * ratio,
      y: a.y + (b.y - a.y) * ratio
    });
  }

  return output;
}

function removeClosingDuplicate(points) {
  if (!Array.isArray(points) || !points.length) return [];

  const output = points
    .map(point => ({ x: Number(point.x), y: Number(point.y) }))
    .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));

  if (
    output.length > 1 &&
    samePoint(output[0], output[output.length - 1])
  ) output.pop();

  return output;
}

function samePoint(a, b) {
  return Math.hypot(
    (a?.x || 0) - (b?.x || 0),
    (a?.y || 0) - (b?.y || 0)
  ) < 1e-9;
}

function normalize(value, scale) {
  return Number.isFinite(value) ? value / scale : 0;
}

function normalizeRatio(ratio) {
  if (!Number.isFinite(ratio) || ratio <= 0) return 0;
  return Math.log(ratio);
}
