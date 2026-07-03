import { buildDetectedFingerprintFromPoints } from './signature-builder.js';
import { normalizePipelineSettings } from './pipeline-settings.js';

export async function buildRasterizedShapeFingerprint(profile, pipelineSettings = {}) {
  const settings = normalizePipelineSettings(pipelineSettings);
  const pathText = String(profile.svgPath || profile.paths || '').trim();
  const bounds = getPathBounds(pathText);

  if (!pathText || !bounds) return null;

  const rasterSize = Math.max(384, settings.fillGridSize * 4);
  const pad = Math.max(bounds.width, bounds.height) * 0.04 || 1;
  const viewBox = {
    x: bounds.minX - pad,
    y: bounds.minY - pad,
    width: bounds.width + pad * 2,
    height: bounds.height + pad * 2
  };
  const svg = buildSvg(pathText, viewBox);
  const bitmap = await createImageBitmap(new Blob([svg], { type: 'image/svg+xml' }));
  const canvas = new OffscreenCanvas(rasterSize, rasterSize);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, rasterSize, rasterSize);
  ctx.drawImage(bitmap, 0, 0, rasterSize, rasterSize);

  const imageData = ctx.getImageData(0, 0, rasterSize, rasterSize);
  const mask = buildBlackMask(imageData.data, rasterSize, rasterSize);
  const points = extractBoundaryPoints(mask, rasterSize, rasterSize);

  if (!points.length) return null;

  const fingerprint = buildDetectedFingerprintFromPoints({
    width: profile.width,
    height: profile.height,
    area: profile.surface || points.length,
    perimeter: profile.perimeter || 0,
    points
  }, settings);

  fingerprint.reference = profile.reference;
  fingerprint.summary.source = 'svg-raster';
  fingerprint.summary.rasterSize = rasterSize;
  fingerprint.summary.rasterBlackPixels = countMask(mask);
  fingerprint.summary.rasterBoundaryPoints = points.length;
  return fingerprint;
}

function buildSvg(pathText, viewBox) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}"><rect x="${viewBox.x}" y="${viewBox.y}" width="${viewBox.width}" height="${viewBox.height}" fill="white"/><path d="${escapeXml(pathText)}" fill="black" stroke="black" stroke-width="0" fill-rule="evenodd"/></svg>`;
}

function buildBlackMask(data, width, height) {
  const mask = new Uint8Array(width * height);
  for (let index = 0; index < mask.length; index++) {
    const offset = index * 4;
    const alpha = data[offset + 3];
    const luminance = 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
    if (alpha > 0 && luminance < 128) mask[index] = 1;
  }
  return mask;
}

function extractBoundaryPoints(mask, width, height) {
  const points = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const index = y * width + x;
      if (!mask[index]) continue;
      if (!mask[index - 1] || !mask[index + 1] || !mask[index - width] || !mask[index + width]) {
        points.push({ x, y });
      }
    }
  }
  return simplifyRasterPoints(points, 900);
}

function simplifyRasterPoints(points, maxPoints) {
  if (points.length <= maxPoints) return sortAroundCenter(points);
  const sorted = sortAroundCenter(points);
  const step = points.length / maxPoints;
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

function getPathBounds(pathText) {
  const points = samplePathPoints(pathText);
  if (!points.length) return null;
  return points.reduce((bounds, point) => ({
    minX: Math.min(bounds.minX, point.x),
    minY: Math.min(bounds.minY, point.y),
    maxX: Math.max(bounds.maxX, point.x),
    maxY: Math.max(bounds.maxY, point.y),
    width: Math.max(bounds.maxX, point.x) - Math.min(bounds.minX, point.x),
    height: Math.max(bounds.maxY, point.y) - Math.min(bounds.minY, point.y)
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity, width: 0, height: 0 });
}

function samplePathPoints(pathText) {
  const tokens = String(pathText).match(/[AaCcHhLlMmQqSsTtVvZz]|[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g) || [];
  const points = [];
  let index = 0;
  let command = '';
  let current = { x: 0, y: 0 };

  while (index < tokens.length) {
    if (/^[A-Za-z]$/.test(tokens[index])) command = tokens[index++];
    const upper = command.toUpperCase();
    const relative = command !== upper;

    if (upper === 'M' || upper === 'L') {
      const point = resolvePoint(readNumber(tokens, index++), readNumber(tokens, index++), current, relative);
      points.push(point);
      current = point;
      if (upper === 'M') command = relative ? 'l' : 'L';
      continue;
    }

    if (upper === 'H') {
      const x = readNumber(tokens, index++);
      current = { x: relative ? current.x + x : x, y: current.y };
      points.push(current);
      continue;
    }

    if (upper === 'V') {
      const y = readNumber(tokens, index++);
      current = { x: current.x, y: relative ? current.y + y : y };
      points.push(current);
      continue;
    }

    if (upper === 'A') {
      index += 5;
      const point = resolvePoint(readNumber(tokens, index++), readNumber(tokens, index++), current, relative);
      points.push(point);
      current = point;
      continue;
    }

    index++;
  }

  return points;
}

function resolvePoint(x, y, current, relative) {
  return relative ? { x: current.x + x, y: current.y + y } : { x, y };
}

function readNumber(tokens, index) {
  const value = Number(tokens[index]);
  return Number.isFinite(value) ? value : 0;
}

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]));
}
