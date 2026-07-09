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
  const points = resampleSvgContours(contours, settings.contourPointCount);
  if (!points.length) return null;

  const fingerprint = buildDetectedFingerprintCore({
    width: profile.width,
    height: profile.height,
    area: profile.surface || countMask(mask),
    perimeter: profile.perimeter || 0,
    points
  }, settings);

  fingerprint.reference = profile.reference;
  fingerprint.summary.source = 'svg-raster-js-contours';
  fingerprint.summary.rasterSize = rasterSize;
  fingerprint.summary.rasterBlackPixels = countMask(mask);
  fingerprint.summary.rasterBoundaryPoints = points.length;
  fingerprint.summary.rasterContours = contours.length;
  fingerprint.summary.arcSampler = 'svg-path-sampler';
  fingerprint.summary.sampleMaxSegmentLength = settings.sampleMaxSegmentLength;
  fingerprint.summary.contourSource = 'svg-subpaths';
  fingerprint.summary.rasterRole = 'fill-mask-diagnostic';
  fingerprint.summary.closedSvgContours = contours.filter(contour => contour.closed).length;
  fingerprint.summary.svgContourCount = contours.length;
  fingerprint.summary.svgHoleCount = Math.max(0, contours.length - 1);
  return closeFingerprintContours(fingerprint);
}

function normalizeSvgContour(contour) {
  const points = (contour?.points || []).map(point => ({ x: point.x, y: point.y }));
  const closed = contour?.closed || (points.length >= 3 && samePoint(points[0], points[points.length - 1]));
  if (closed && points.length >= 3 && !samePoint(points[0], points[points.length - 1])) {
    points.push({ ...points[0] });
  }
  return {
    points,
    closed: Boolean(closed),
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

function resampleSvgContours(contours, targetCount) {
  const closedContours = contours
    .filter(contour => contour.points.length > 2)
    .map(contour => ({ ...contour, points: forceClosedPoints(contour.points) }));

  if (!closedContours.length) return [];

  const totalLength = closedContours.reduce((sum, contour) => sum + contourLength(contour.points), 0) || 1;
  const output = [];

  for (const contour of closedContours) {
    const count = Math.max(4, Math.round((contourLength(contour.points) / totalLength) * targetCount));
    const sampled = resampleClosedPath(contour.points, count);
    sampled.forEach((point, index) => output.push({
      x: point.x,
      y: point.y,
      breakBefore: output.length > 0 && index === 0,
      closed: true
    }));
  }

  return closeContours(output.slice(0, targetCount));
}

function forceClosedPoints(points) {
  const output = (points || []).map(point => ({ x: point.x, y: point.y }));
  if (output.length >= 3 && !samePoint(output[0], output[output.length - 1])) {
    output.push({ ...output[0] });
  }
  return output;
}

function closeContours(points) {
  const output = [];
  for (const contour of splitContours(points)) {
    if (!contour.length) continue;
    output.push(...contour);
    const first = contour[0];
    const last = contour[contour.length - 1];
    if (contour.length >= 3 && !samePoint(first, last)) {
      output.push({ x: first.x, y: first.y, breakBefore: false, closed: true });
    }
  }
  return output;
}

function closeFingerprintContours(fingerprint) {
  const points = closeContours(fingerprint?.descriptors?.points || []);
  const normalizedPoints = closeContours(fingerprint?.contour?.normalizedPoints || []);
  if (fingerprint?.descriptors) fingerprint.descriptors.points = points;
  if (fingerprint?.contour) {
    fingerprint.contour.normalizedPoints = normalizedPoints;
    fingerprint.contour.contourCount = splitContours(normalizedPoints).length;
  }
  if (fingerprint?.summary) {
    fingerprint.summary.contourCount = splitContours(normalizedPoints).length;
    fingerprint.summary.contoursForcedClosed = true;
  }
  return fingerprint;
}

function contourLength(points) {
  let total = 0;
  for (let index = 1; index < points.length; index++) {
    total += distance(points[index], points[index - 1]);
  }
  return total;
}

function resampleClosedPath(points, targetCount) {
  if (points.length <= 2) return points;
  const source = forceClosedPoints(points);
  const distances = [0];
  let total = 0;
  for (let index = 1; index < source.length; index++) {
    total += distance(source[index], source[index - 1]);
    distances.push(total);
  }
  if (!total) return source.slice(0, targetCount);

  const output = [];
  for (let index = 0; index < targetCount; index++) {
    const target = (index / targetCount) * total;
    let segment = 1;
    while (segment < distances.length - 1 && distances[segment] < target) segment++;
    const previous = source[segment - 1];
    const current = source[segment];
    const segmentLength = distances[segment] - distances[segment - 1] || 1;
    const t = (target - distances[segment - 1]) / segmentLength;
    output.push({ x: previous.x + (current.x - previous.x) * t, y: previous.y + (current.y - previous.y) * t });
  }
  return output;
}

function distance(a, b) {
  return Math.hypot((a?.x || 0) - (b?.x || 0), (a?.y || 0) - (b?.y || 0));
}

function samePoint(a, b) {
  return distance(a, b) < 1e-9;
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
