import { buildCannyEdgeMask } from './canny-edge.js';

export function buildRobustEdgeMask(gray, width, height, detectionSettings) {
  const canny = buildCannyEdgeMask(gray, width, height, detectionSettings.edgeQuantile);
  const dark = buildAdaptiveDarkMask(gray, width, height);
  const otsu = buildOtsuMask(gray, width, height);

  const strategies = [
    buildStrategy('canny', canny, width, height),
    buildStrategy('dark-edges', boundaryFromMask(dark, width, height), width, height),
    buildStrategy('otsu-edges', boundaryFromMask(otsu, width, height), width, height),
    buildStrategy('dark-hybrid', buildHybridMask(canny, dark, width, height), width, height),
    buildStrategy('otsu-hybrid', buildHybridMask(canny, otsu, width, height), width, height)
  ].sort((a, b) => b.score - a.score);

  const best = strategies[0];
  return {
    mask: best.mask,
    previewMask: best.mask,
    filledMask: false,
    mode: best.name,
    stats: {
      score: best.score,
      points: best.points,
      pointRatio: best.pointRatio,
      componentCount: best.componentCount,
      largestRatio: best.largestRatio,
      strategies: strategies.map(strategy => ({
        mode: strategy.name,
        score: strategy.score,
        points: strategy.points,
        pointRatio: strategy.pointRatio,
        componentCount: strategy.componentCount,
        largestRatio: strategy.largestRatio
      }))
    }
  };
}

export function buildFilledMaterialMask(gray, width, height) {
  const threshold = otsuThreshold(gray);
  const mask = new Uint8Array(gray.length);

  for (let index = 0; index < gray.length; index++) {
    mask[index] = gray[index] <= threshold ? 1 : 0;
  }

  const cleaned = removeTinyComponents(mask, width, height, Math.max(4, Math.round(width * height * 0.00001)));
  const previewMask = boundaryFromMask(cleaned, width, height);
  const stats = componentStats(cleaned, width, height);
  const points = countMask(cleaned);

  return {
    mask: cleaned,
    previewMask,
    filledMask: true,
    mode: 'filled-material-otsu',
    stats: {
      threshold,
      points,
      pointRatio: points / Math.max(1, width * height),
      componentCount: stats.componentCount,
      largestRatio: stats.largestRatio,
      activePixels: points,
      segmentationRole: 'material-mask'
    }
  };
}

function buildStrategy(name, mask, width, height) {
  const points = countMask(mask);
  const pointRatio = points / Math.max(1, width * height);
  const components = componentStats(mask, width, height);
  const score = scoreSegmentation(pointRatio, components);
  return { name, mask, score, points, pointRatio, ...components };
}

function scoreSegmentation(pointRatio, components) {
  const densityScore = scoreRange(pointRatio, 0.0015, 0.010, 0.085);
  const componentScore = scoreRange(components.componentCount, 1, 6, 28);
  const largestScore = scoreRange(components.largestRatio, 0.0008, 0.010, 0.38);
  const noisePenalty = pointRatio > 0.12 ? 0.35 : 0;
  return clamp(densityScore * 0.34 + componentScore * 0.24 + largestScore * 0.42 - noisePenalty, 0, 1);
}

function buildHybridMask(canny, regionMask, width, height) {
  const regionRatio = countMask(regionMask) / Math.max(1, width * height);
  if (regionRatio < 0.004 || regionRatio > 0.42) return canny;
  const regionEdges = boundaryFromMask(regionMask, width, height);
  const expandedRegion = dilateMask(regionMask, width, height, 3);
  return orMasks(regionEdges, keepMaskInside(canny, expandedRegion));
}

function buildOtsuMask(gray, width, height) {
  const threshold = otsuThreshold(gray);
  const mask = new Uint8Array(gray.length);
  for (let index = 0; index < gray.length; index++) {
    if (gray[index] <= threshold) mask[index] = 1;
  }
  return closeMask(openMask(mask, width, height, 1), width, height, 2);
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
  return Math.max(20, Math.min(220, bestThreshold));
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
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      if (!mask[index]) continue;
      if (
        x === 0 || x === width - 1 || y === 0 || y === height - 1 ||
        !mask[index - 1] || !mask[index + 1] || !mask[index - width] || !mask[index + width]
      ) output[index] = 1;
    }
  }
  return output;
}

function removeTinyComponents(mask, width, height, minArea) {
  const visited = new Uint8Array(mask.length);
  const output = new Uint8Array(mask.length);
  const queue = [];

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || visited[start]) continue;
    queue.length = 0;
    queue.push(start);
    visited[start] = 1;

    for (let q = 0; q < queue.length; q++) {
      const current = queue[q];
      const x = current % width;
      const y = Math.floor(current / width);
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          const next = yy * width + xx;
          if (!mask[next] || visited[next]) continue;
          visited[next] = 1;
          queue.push(next);
        }
      }
    }

    if (queue.length >= minArea) {
      for (const index of queue) output[index] = 1;
    }
  }

  return output;
}

function componentStats(mask, width, height) {
  const visited = new Uint8Array(mask.length);
  const queue = [];
  let componentCount = 0;
  let largest = 0;

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || visited[start]) continue;
    componentCount++;
    queue.length = 0;
    queue.push(start);
    visited[start] = 1;
    let area = 0;

    for (let q = 0; q < queue.length; q++) {
      const current = queue[q];
      const x = current % width;
      const y = Math.floor(current / width);
      area++;

      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const xx = x + dx;
          const next = yy * width + xx;
          if (xx < 0 || xx >= width || visited[next] || !mask[next]) continue;
          visited[next] = 1;
          queue.push(next);
        }
      }
    }

    largest = Math.max(largest, area);
  }

  return { componentCount, largestRatio: largest / Math.max(1, width * height) };
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

function scoreRange(value, min, good, max) {
  if (value <= min) return 0;
  if (value <= good) return (value - min) / Math.max(good - min, 1e-6);
  if (value <= max) return 1;
  return Math.max(0, 1 - (value - max) / Math.max(max, 1e-6));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
