import { buildDetectedFingerprintCore } from './signature-builder.js';
import { normalizePipelineSettings } from './pipeline-settings.js';
import { sampleSvgPathPolyline } from './svg-path-sampler.js';

export async function buildRasterizedProfileFingerprintCore(profile, pipelineSettings = {}) {
  const settings = normalizePipelineSettings(pipelineSettings);
  const pathText = String(profile.svgPath || profile.paths || '').trim();
  const outline = sampleSvgPathPolyline(pathText, { maxSegmentLength: settings.sampleMaxSegmentLength });
  const bounds = getBounds(outline);
  if (!pathText || !bounds || outline.length < 3) return null;

  const rasterSize = Math.max(384, settings.fillGridSize * 4);
  const mask = rasterizeOutline(outline, bounds, rasterSize);
  const points = resampleSvgOutline(outline, settings.contourPointCount);
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
  fingerprint.summary.rasterContours = splitContours(points).length;
  fingerprint.summary.arcSampler = 'svg-path-sampler';
  fingerprint.summary.sampleMaxSegmentLength = settings.sampleMaxSegmentLength;
  fingerprint.summary.contourSource = 'svg-outline';
  fingerprint.summary.rasterRole = 'fill-mask-diagnostic';
  fingerprint.summary.closedSvgContours = countClosedContours(points);
  return closeFingerprintContours(fingerprint);
}

function rasterizeOutline(points, bounds, rasterSize) {
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
  const rasterPoints = points.map(point => ({
    x: offsetX + (point.x - viewBox.x) * scale,
    y: offsetY + (point.y - viewBox.y) * scale,
    breakBefore: Boolean(point.breakBefore)
  }));
  const contours = splitContours(rasterPoints).filter(contour => contour.length >= 3);

  for (let y = 0; y < rasterSize; y++) {
    for (let x = 0; x < rasterSize; x++) {
      if (isPointInsideContours(x + 0.5, y + 0.5, contours)) mask[y * rasterSize + x] = 1;
    }
  }
  return mask;
}

function resampleSvgOutline(points, targetCount) {
  const contours = splitContours(points)
    .map(contour => forceCloseContour(markContourClosure(contour)))
    .filter(contour => contour.length > 2);

  if (!contours.length) return [];

  const totalLength = contours.reduce((sum, contour) => sum + contourLength(contour), 0) || 1;
  const output = [];

  for (const contour of contours) {
    const count = Math.max(4, Math.round((contourLength(contour) / totalLength) * targetCount));
    const sampled = resampleClosedPath(contour, count);
    sampled.forEach((point, index) => output.push({
      ...point,
      breakBefore: output.length > 0 && index === 0
    }));
  }

  return closeContours(output.slice(0, targetCount));
}

function markContourClosure(contour) {
  const jumpLimit = estimateJumpLimit(contour);
  const closed = distance(contour[0], contour[contour.length - 1]) <= jumpLimit;
  return Object.assign([...contour], { closed });
}

function forceCloseContour(contour) {
  if (contour.length < 3) return contour;
  const first = contour[0];
  const last = contour[contour.length - 1];
  if (distance(first, last) > 1e-9) contour.push({ x: first.x, y: first.y });
  contour.closed = true;
  return contour;
}

function closeContours(points) {
  const output = [];
  for (const contour of splitContours(points)) {
    if (!contour.length) continue;
    output.push(...contour);
    const first = contour[0];
    const last = contour[contour.length - 1];
    if (contour.length >= 3 && distance(first, last) > 1e-9) {
      output.push({ x: first.x, y: first.y, breakBefore: false });
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

function countClosedContours(points) {
  return splitContours(points).filter(contour => contour.length >= 3 && distance(contour[0], contour[contour.length - 1]) <= 1e-9).length;
}

function contourLength(points) {
  let total = 0;
  for (let index = 1; index <= points.length; index++) {
    const previous = points[index - 1];
    const current = points[index % points.length];
    total += distance(current, previous);
  }
  return total;
}

function resampleClosedPath(points, targetCount) {
  if (points.length <= 2) return points;
  const distances = [0];
  let total = 0;
  for (let index = 1; index <= points.length; index++) {
    const previous = points[index - 1];
    const current = points[index % points.length];
    total += distance(current, previous);
    distances.push(total);
  }
  if (!total) return points.slice(0, targetCount);

  const output = [];
  for (let index = 0; index < targetCount; index++) {
    const target = (index / targetCount) * total;
    let segment = 1;
    while (segment < distances.length - 1 && distances[segment] < target) segment++;
    const previous = points[segment - 1];
    const current = points[segment % points.length];
    const segmentLength = distances[segment] - distances[segment - 1] || 1;
    const t = (target - distances[segment - 1]) / segmentLength;
    output.push({ x: previous.x + (current.x - previous.x) * t, y: previous.y + (current.y - previous.y) * t });
  }
  return output;
}

function estimateJumpLimit(points) {
  if (!points || points.length < 3) return 0.01;
  const distances = [];
  for (let index = 1; index < points.length; index++) {
    const value = distance(points[index], points[index - 1]);
    if (value > 0) distances.push(value);
  }
  distances.sort((a, b) => a - b);
  const median = distances[Math.floor(distances.length / 2)] || 0.01;
  return Math.max(0.01, median * 8);
}

function distance(a, b) {
  return Math.hypot((a?.x || 0) - (b?.x || 0), (a?.y || 0) - (b?.y || 0));
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
    if (isPointInsidePolygon(x, y, contour)) inside = !inside;
  }
  return inside;
}

function countMask(mask) {
  return mask.reduce((sum, value) => sum + value, 0);
}

function getBounds(points) {
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
