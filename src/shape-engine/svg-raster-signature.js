import { buildDetectedFingerprintCore } from './signature-builder.js';
import { normalizePipelineSettings } from './pipeline-settings.js';
import { sampleSvgPathPolyline } from './svg-path-sampler.js';

export async function buildRasterizedProfileFingerprintCore(profile, pipelineSettings = {}) {
  const settings = normalizePipelineSettings(pipelineSettings);
  const pathText = String(profile.svgPath || profile.paths || '').trim();
  const outline = sampleSvgPathPolyline(pathText, { lineSteps: 8, arcMaxStep: Math.PI / 48 });
  const bounds = getBounds(outline);
  if (!pathText || !bounds || outline.length < 3) return null;

  const rasterSize = Math.max(384, settings.fillGridSize * 4);
  const mask = rasterizeOutline(outline, bounds, rasterSize);
  const points = extractOrderedBoundaryPoints(mask, rasterSize, rasterSize, settings.contourPointCount);
  if (!points.length) return null;

  const fingerprint = buildDetectedFingerprintCore({
    width: profile.width,
    height: profile.height,
    area: profile.surface || countMask(mask),
    perimeter: profile.perimeter || 0,
    points
  }, settings);

  fingerprint.reference = profile.reference;
  fingerprint.summary.source = 'svg-raster-js-ordered';
  fingerprint.summary.rasterSize = rasterSize;
  fingerprint.summary.rasterBlackPixels = countMask(mask);
  fingerprint.summary.rasterBoundaryPoints = points.length;
  fingerprint.summary.arcSampler = 'svg-path-sampler';
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

function extractOrderedBoundaryPoints(mask, width, height, targetCount) {
  const boundary = [];
  const boundarySet = new Set();
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const index = y * width + x;
      if (!mask[index]) continue;
      if (!mask[index - 1] || !mask[index + 1] || !mask[index - width] || !mask[index + width]) {
        const point = { x, y };
        boundary.push(point);
        boundarySet.add(key(point));
      }
    }
  }
  const ordered = orderBoundaryPoints(boundary, boundarySet);
  return resampleClosedPath(ordered, targetCount);
}

function orderBoundaryPoints(points, pointSet) {
  if (points.length <= 2) return points;
  const remaining = new Map(points.map(point => [key(point), point]));
  let current = points.reduce((best, point) => point.y < best.y || (point.y === best.y && point.x < best.x) ? point : best, points[0]);
  const output = [];

  while (remaining.size) {
    output.push(current);
    remaining.delete(key(current));
    const next = findNextNeighbor(current, remaining, pointSet) || findNearest(current, remaining);
    if (!next) break;
    current = next;
  }

  return output;
}

function findNextNeighbor(point, remaining, pointSet) {
  let best = null;
  let bestDistance = Infinity;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const candidateKey = `${point.x + dx},${point.y + dy}`;
      if (!pointSet.has(candidateKey) || !remaining.has(candidateKey)) continue;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = remaining.get(candidateKey);
      }
    }
  }
  return best;
}

function findNearest(point, remaining) {
  let best = null;
  let bestDistance = Infinity;
  for (const candidate of remaining.values()) {
    const distance = (candidate.x - point.x) ** 2 + (candidate.y - point.y) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}

function resampleClosedPath(points, targetCount) {
  if (points.length <= 2) return points;
  const distances = [0];
  let total = 0;
  for (let index = 1; index <= points.length; index++) {
    const previous = points[index - 1];
    const current = points[index % points.length];
    total += Math.hypot(current.x - previous.x, current.y - previous.y);
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

function key(point) {
  return `${Math.round(point.x)},${Math.round(point.y)}`;
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
