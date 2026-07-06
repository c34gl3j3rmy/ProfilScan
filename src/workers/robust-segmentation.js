import { buildCannyEdgeMask } from './canny-edge.js';

export function buildRobustEdgeMask(gray, width, height, detectionSettings) {
  const canny = buildCannyEdgeMask(gray, width, height, detectionSettings.edgeQuantile);
  const dark = buildAdaptiveDarkMask(gray, width, height);
  const darkRatio = countMask(dark) / Math.max(1, width * height);

  if (darkRatio < 0.004 || darkRatio > 0.42) {
    return { mask: canny, mode: 'canny', stats: { darkRatio, points: countMask(canny) } };
  }

  const darkEdges = boundaryFromMask(dark, width, height);
  const expandedDark = dilateMask(dark, width, height, 3);
  const focusedCanny = keepMaskInside(canny, expandedDark);
  const hybrid = orMasks(darkEdges, focusedCanny);
  return { mask: hybrid, mode: 'dark-hybrid', stats: { darkRatio, points: countMask(hybrid) } };
}

function buildAdaptiveDarkMask(gray, width, height) {
  const globalThreshold = otsuThreshold(gray);
  const radius = Math.max(12, Math.round(Math.min(width, height) * 0.025));
  const mask = new Uint8Array(gray.length);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const index = y * width + x;
      const localMean = averageAround(gray, width, height, x, y, radius);
      const localThreshold = Math.min(globalThreshold + 18, localMean - 18);
      if (gray[index] <= localThreshold) mask[index] = 1;
    }
  }

  return closeMask(openMask(mask, width, height, 1), width, height, 2);
}

function otsuThreshold(gray) {
  const histogram = new Uint32Array(256);
  for (const value of gray) histogram[value]++;
  const total = gray.length;
  let sum = 0;
  for (let value = 0; value < 256; value++) sum += value * histogram[value];

  let sumBackground = 0;
  let weightBackground = 0;
  let bestThreshold = 96;
  let bestVariance = 0;

  for (let threshold = 0; threshold < 256; threshold++) {
    weightBackground += histogram[threshold];
    if (!weightBackground) continue;
    const weightForeground = total - weightBackground;
    if (!weightForeground) break;
    sumBackground += threshold * histogram[threshold];
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sum - sumBackground) / weightForeground;
    const variance = weightBackground * weightForeground * Math.pow(meanBackground - meanForeground, 2);
    if (variance > bestVariance) {
      bestVariance = variance;
      bestThreshold = threshold;
    }
  }
  return Math.max(40, Math.min(180, bestThreshold));
}

function averageAround(gray, width, height, x, y, radius) {
  let sum = 0;
  let count = 0;
  const step = Math.max(2, Math.round(radius / 5));
  for (let dy = -radius; dy <= radius; dy += step) {
    const yy = y + dy;
    if (yy < 0 || yy >= height) continue;
    for (let dx = -radius; dx <= radius; dx += step) {
      const xx = x + dx;
      if (xx < 0 || xx >= width) continue;
      sum += gray[yy * width + xx];
      count++;
    }
  }
  return sum / Math.max(1, count);
}

function boundaryFromMask(mask, width, height) {
  const output = new Uint8Array(mask.length);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const index = y * width + x;
      if (!mask[index]) continue;
      if (!mask[index - 1] || !mask[index + 1] || !mask[index - width] || !mask[index + width]) output[index] = 1;
    }
  }
  return output;
}

function openMask(mask, width, height, radius) {
  return dilateMask(erodeMask(mask, width, height, radius), width, height, radius);
}

function closeMask(mask, width, height, radius) {
  return erodeMask(dilateMask(mask, width, height, radius), width, height, radius);
}

function dilateMask(mask, width, height, radius) {
  const output = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let found = 0;
      for (let dy = -radius; dy <= radius && !found; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          if (xx >= 0 && xx < width && mask[yy * width + xx]) { found = 1; break; }
        }
      }
      output[y * width + x] = found;
    }
  }
  return output;
}

function erodeMask(mask, width, height, radius) {
  const output = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let keep = 1;
      for (let dy = -radius; dy <= radius && keep; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) { keep = 0; break; }
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width || !mask[yy * width + xx]) { keep = 0; break; }
        }
      }
      output[y * width + x] = keep;
    }
  }
  return output;
}

function keepMaskInside(mask, allowed) {
  const output = new Uint8Array(mask.length);
  for (let index = 0; index < mask.length; index++) output[index] = mask[index] && allowed[index] ? 1 : 0;
  return output;
}

function orMasks(a, b) {
  const output = new Uint8Array(a.length);
  for (let index = 0; index < a.length; index++) output[index] = a[index] || b[index] ? 1 : 0;
  return output;
}

function countMask(mask) {
  let count = 0;
  for (const value of mask) if (value) count++;
  return count;
}
