import { buildDetectedFingerprintCore } from './signature-builder.js';
import { normalizePipelineSettings } from './pipeline-settings.js';
import { sampleSvgPathContours } from './svg-path-sampler.js';

export async function buildRasterizedProfileFingerprintCore(profile, pipelineSettings = {}) {
  const settings = normalizePipelineSettings(pipelineSettings);
  const pathText = String(profile.svgPath || profile.paths || '').trim();
  const contours = sampleSvgPathContours(pathText, { maxSegmentLength: settings.sampleMaxSegmentLength })
    .map(normalizeSvgContour)
    .filter(contour => contour.points.length >= 3);
  const bounds = getContourBounds(contours);
  if (!pathText || !bounds || !contours.length) return null;

  const rasterSize = Math.max(384, settings.fillGridSize * 4);
  const mask = rasterizeContours(contours, bounds, rasterSize);

  const fingerprint = buildDetectedFingerprintCore({
    width: profile.width,
    height: profile.height,
    area: profile.surface || countMask(mask),
    perimeter: profile.perimeter || 0,
    contours
  }, settings);

  fingerprint.reference = profile.reference;
  fingerprint.summary.source = 'svg-raster-js-contours';
  fingerprint.summary.rasterSize = rasterSize;
  fingerprint.summary.rasterBlackPixels = countMask(mask);
  fingerprint.summary.rasterBoundaryPoints = contours.reduce((sum, contour) => sum + contour.points.length, 0);
  fingerprint.summary.rasterContours = contours.length;
  fingerprint.summary.arcSampler = 'svg-path-sampler';
  fingerprint.summary.sampleMaxSegmentLength = settings.sampleMaxSegmentLength;
  fingerprint.summary.contourSource = 'svg-subpaths';
  fingerprint.summary.rasterRole = 'fill-mask-diagnostic';
  fingerprint.summary.closedSvgContours = contours.filter(contour => contour.closed).length;
  fingerprint.summary.svgContourCount = contours.length;
  fingerprint.summary.svgHoleCount = Math.max(0, contours.length - 1);
  return fingerprint;
}

function normalizeSvgContour(contour) {
  const points = forceClosedPoints((contour?.points || []).map(point => ({ x: point.x, y: point.y })));
  return {
    points,
    closed: true,
    area: signedArea(points),
    role: 'unknown'
  };
}

function rasterizeContours(contours, bounds, rasterSize) {
  const mask = new Uint8Array(rasterSize * rasterSize);
  const pad = Math.max(bounds.width, bounds.height) * 0.04 || 1;
  const viewBox = {
    x: bounds.minX - pad,
    y: bounds.minY - pad,
    width: bounds.width + pad * 2,
    height: bounds.height + pad * 2
  };
  const scale = rasterSize / Math.max(viewBox.width, viewBox.height);
  const offsetX = (rasterSize - viewBox.width * scale) / 2;
  const offsetY = (rasterSize - viewBox.height * scale) / 2;
  const rasterContours = contours.map(contour => ({
    ...contour,
    points: contour.points.map(point => ({
      x: offsetX + (point.x - viewBox.x) * scale,
      y: offsetY + (point.y - viewBox.y) * scale
    }))
  }));

  for (let y = 0; y < rasterSize; y++) {
    for (let x = 0; x < rasterSize; x++) {
      if (isPointInsideContours(x + 0.5, y + 0.5, rasterContours)) mask[y * rasterSize + x] = 1;
    }
  }
  return mask;
}

function forceClosedPoints(points) {
  const output = (points || []).map(point => ({ x: point.x, y: point.y }));
  if (output.length >= 3 && !samePoint(output[0], output[output.length - 1])) {
    output.push({ ...output[0] });
  }
  return output;
}

function distance(a, b) {
  return Math.hypot((a?.x || 0) - (b?.x || 0), (a?.y || 0) - (b?.y || 0));
}

function samePoint(a, b) {
  return distance(a, b) < 1e-9;
}

function isPointInsideContours(x, y, contours) {
  let inside = false;
  for (const contour of contours) {
    if (isPointInsidePolygon(x, y, contour.points || contour)) inside = !inside;
  }
  return inside;
}

function signedArea(points) {
  let area = 0;
  for (let index = 0; index < points.length; index++) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return area / 2;
}

function countMask(mask) {
  return mask.reduce((sum, value) => sum + value, 0);
}

function getContourBounds(contours) {
  const points = contours.flatMap(contour => contour.points || []);
  if (!points.length) return null;
  return points.reduce((bounds, point) => {
    const minX = Math.min(bounds.minX, point.x);
    const minY = Math.min(bounds.minY, point.y);
    const maxX = Math.max(bounds.maxX, point.x);
    const maxY = Math.max(bounds.maxY, point.y);
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity, width: 0, height: 0 });
}

function isPointInsidePolygon(x, y, points) {
  let inside = false;
  for (let index = 0, previousIndex = points.length - 1; index < points.length; previousIndex = index++) {
    const point = points[index];
    const previous = points[previousIndex];
    const crosses = (point.y > y) !== (previous.y > y);
    if (crosses) {
      const atX = ((previous.x - point.x) * (y - point.y)) / ((previous.y - point.y) || 1e-12) + point.x;
      if (x < atX) inside = !inside;
    }
  }
  return inside;
}
