import { buildDetectedFingerprintFromPoints } from './signature-builder.js';
import { normalizePipelineSettings } from './pipeline-settings.js';

export async function buildRasterizedShapeFingerprint(profile, pipelineSettings = {}) {
  const settings = normalizePipelineSettings(pipelineSettings);
  const pathText = String(profile.svgPath || profile.paths || '').trim();
  const outline = samplePathPolyline(pathText, true);
  const bounds = getBounds(outline);
  if (!pathText || !bounds || outline.length < 3) return null;

  const rasterSize = Math.max(384, settings.fillGridSize * 4);
  const mask = rasterizeOutline(outline, bounds, rasterSize);
  const points = extractBoundaryPoints(mask, rasterSize, rasterSize);
  if (!points.length) return null;

  const fingerprint = buildDetectedFingerprintFromPoints({
    width: profile.width,
    height: profile.height,
    area: profile.surface || countMask(mask),
    perimeter: profile.perimeter || 0,
    points
  }, settings);

  fingerprint.reference = profile.reference;
  fingerprint.summary.source = 'svg-raster-js';
  fingerprint.summary.rasterSize = rasterSize;
  fingerprint.summary.rasterBlackPixels = countMask(mask);
  fingerprint.summary.rasterBoundaryPoints = points.length;
  return fingerprint;
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
    y: offsetY + (point.y - viewBox.y) * scale
  }));

  for (let y = 0; y < rasterSize; y++) {
    for (let x = 0; x < rasterSize; x++) {
      if (isPointInsidePolygon(x + 0.5, y + 0.5, rasterPoints)) mask[y * rasterSize + x] = 1;
    }
  }
  return mask;
}

function extractBoundaryPoints(mask, width, height) {
  const points = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const index = y * width + x;
      if (!mask[index]) continue;
      if (!mask[index - 1] || !mask[index + 1] || !mask[index - width] || !mask[index + width]) points.push({ x, y });
    }
  }
  return simplifyRasterPoints(points, 900);
}

function simplifyRasterPoints(points, maxPoints) {
  const sorted = sortAroundCenter(points);
  if (sorted.length <= maxPoints) return sorted;
  const step = sorted.length / maxPoints;
  const output = [];
  for (let index = 0; index < maxPoints; index++) output.push(sorted[Math.floor(index * step)]);
  return output;
}

function sortAroundCenter(points) {
  if (points.length <= 2) return points;
  const center = points.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
  center.x /= points.length;
  center.y /= points.length;
  return [...points].sort((a, b) => Math.atan2(a.y - center.y, a.x - center.x) - Math.atan2(b.y - center.y, b.x - center.x));
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

function samplePathPolyline(pathText, densify) {
  const tokens = String(pathText).match(/[AaHhLlMmVvZz]|[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g) || [];
  const points = [];
  let index = 0;
  let command = '';
  let current = { x: 0, y: 0 };
  let start = { x: 0, y: 0 };

  while (index < tokens.length) {
    if (/^[A-Za-z]$/.test(tokens[index])) command = tokens[index++];
    const upper = command.toUpperCase();
    const relative = command !== upper;

    if (upper === 'M') {
      current = resolvePoint(readNumber(tokens, index++), readNumber(tokens, index++), current, relative);
      start = current;
      points.push(current);
      command = relative ? 'l' : 'L';
      continue;
    }
    if (upper === 'L') {
      const next = resolvePoint(readNumber(tokens, index++), readNumber(tokens, index++), current, relative);
      pushSegment(points, current, next, densify ? 8 : 1);
      current = next;
      continue;
    }
    if (upper === 'H') {
      const x = readNumber(tokens, index++);
      const next = { x: relative ? current.x + x : x, y: current.y };
      pushSegment(points, current, next, densify ? 8 : 1);
      current = next;
      continue;
    }
    if (upper === 'V') {
      const y = readNumber(tokens, index++);
      const next = { x: current.x, y: relative ? current.y + y : y };
      pushSegment(points, current, next, densify ? 8 : 1);
      current = next;
      continue;
    }
    if (upper === 'A') {
      const rx = readNumber(tokens, index++);
      const ry = readNumber(tokens, index++);
      index += 3;
      const next = resolvePoint(readNumber(tokens, index++), readNumber(tokens, index++), current, relative);
      pushSegment(points, current, next, densify ? Math.max(6, Math.ceil((Math.abs(rx) + Math.abs(ry)) / 2)) : 1);
      current = next;
      continue;
    }
    if (upper === 'Z') {
      pushSegment(points, current, start, densify ? 8 : 1);
      current = start;
      command = '';
      continue;
    }
    index++;
  }
  return points;
}

function pushSegment(points, from, to, steps) {
  for (let index = 1; index <= steps; index++) {
    const t = index / steps;
    points.push({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
  }
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

function resolvePoint(x, y, current, relative) {
  return relative ? { x: current.x + x, y: current.y + y } : { x, y };
}

function readNumber(tokens, index) {
  const value = Number(tokens[index]);
  return Number.isFinite(value) ? value : 0;
}
