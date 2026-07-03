export async function computeAutoImageSettings(imageBitmap) {
  const sample = readImageSample(imageBitmap, 420);
  const gray = buildGray(sample.imageData);
  const stats = computeGrayStats(gray);
  const gradientStats = computeGradientStats(gray, sample.width, sample.height);
  const edgeQuantile = chooseEdgeQuantile(gradientStats);

  return {
    brightness: clamp(Math.round(128 - stats.mean), -40, 40),
    contrast: clamp(Math.round(100 * (58 / Math.max(24, stats.std))), 75, 165),
    edgeQuantile,
    linkRadius: chooseLinkRadius(sample.width, sample.height, gradientStats),
    minArea: chooseMinArea(sample.width, sample.height),
    mergeGap: 45
  };
}

export function applyAutoImageSettings(inputs, settings) {
  setRange(inputs.brightness, settings.brightness);
  setRange(inputs.contrast, settings.contrast);
  setRange(inputs.edgeQuantile, settings.edgeQuantile);
  setRange(inputs.linkRadius, settings.linkRadius);
  setRange(inputs.minArea, settings.minArea);
  setRange(inputs.mergeGap, settings.mergeGap);
}

function readImageSample(imageBitmap, maxSize) {
  const scale = Math.min(1, maxSize / Math.max(imageBitmap.width, imageBitmap.height));
  const width = Math.max(1, Math.round(imageBitmap.width * scale));
  const height = Math.max(1, Math.round(imageBitmap.height * scale));
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height) : document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(imageBitmap, 0, 0, width, height);
  return { imageData: ctx.getImageData(0, 0, width, height), width, height };
}

function buildGray(imageData) {
  const gray = new Uint8Array(imageData.width * imageData.height);
  for (let index = 0; index < gray.length; index++) {
    const offset = index * 4;
    gray[index] = Math.round(0.299 * imageData.data[offset] + 0.587 * imageData.data[offset + 1] + 0.114 * imageData.data[offset + 2]);
  }
  return gray;
}

function computeGrayStats(gray) {
  let sum = 0;
  for (const value of gray) sum += value;
  const mean = sum / Math.max(1, gray.length);
  let variance = 0;
  for (const value of gray) variance += (value - mean) ** 2;
  return { mean, std: Math.sqrt(variance / Math.max(1, gray.length)) };
}

function computeGradientStats(gray, width, height) {
  const values = [];
  let strong = 0;
  let visible = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const gx = -gray[i - width - 1] - 2 * gray[i - 1] - gray[i + width - 1] + gray[i - width + 1] + 2 * gray[i + 1] + gray[i + width + 1];
      const gy = -gray[i - width - 1] - 2 * gray[i - width] - gray[i - width + 1] + gray[i + width - 1] + 2 * gray[i + width] + gray[i + width + 1];
      const mag = Math.min(1020, Math.abs(gx) + Math.abs(gy));
      if (mag > 0) {
        values.push(mag);
        if (mag > 35) visible++;
        if (mag > 160) strong++;
      }
    }
  }

  values.sort((a, b) => a - b);
  return {
    values,
    visibleRatio: visible / Math.max(1, width * height),
    strongRatio: strong / Math.max(1, width * height),
    median: quantile(values, 0.5),
    q75: quantile(values, 0.75),
    q90: quantile(values, 0.9)
  };
}

function chooseEdgeQuantile(stats) {
  if (!stats.values.length) return 82;
  const autoCannyThreshold = Math.max(35, Math.min(220, stats.median * 1.33));
  const rank = lowerBound(stats.values, autoCannyThreshold) / stats.values.length;
  const densityCorrection = stats.strongRatio > 0.08 ? 5 : stats.visibleRatio < 0.015 ? -5 : 0;
  return clamp(Math.round(rank * 100 + densityCorrection), 68, 92);
}

function chooseLinkRadius(width, height, stats) {
  const base = Math.round(Math.min(width, height) / 120);
  const noisyPenalty = stats.visibleRatio > 0.18 ? -1 : 0;
  return clamp(base + 3 + noisyPenalty, 2, 9);
}

function chooseMinArea(width, height) {
  const area = width * height;
  if (area < 120000) return 5;
  if (area > 300000) return 9;
  return 7;
}

function quantile(values, q) {
  if (!values.length) return 0;
  return values[Math.max(0, Math.min(values.length - 1, Math.floor(values.length * q)))] || 0;
}

function lowerBound(values, target) {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (values[mid] < target) low = mid + 1;
    else high = mid;
  }
  return low;
}

function setRange(input, value) {
  if (!input || value === undefined) return;
  input.value = String(value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
