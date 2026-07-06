export function getScaledImageData(imageBitmap, maxSize) {
  const scale = Math.min(1, maxSize / Math.max(imageBitmap.width, imageBitmap.height));
  const width = Math.max(1, Math.round(imageBitmap.width * scale));
  const height = Math.max(1, Math.round(imageBitmap.height * scale));
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(imageBitmap, 0, 0, width, height);
  return { imageData: ctx.getImageData(0, 0, width, height), width, height, scale };
}

export function buildGray(imageData, imageSettings) {
  const { data, width, height } = imageData;
  const gray = new Uint8Array(width * height);
  const contrast = imageSettings.contrast / 100;
  const brightness = imageSettings.brightness;

  for (let index = 0; index < gray.length; index++) {
    const offset = index * 4;
    const luminance = 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
    gray[index] = clampByte((luminance - 128) * contrast + 128 + brightness);
  }

  return gray;
}

export function suppressTexture(gray, width, height, strength = 0) {
  const radius = Math.round(strength);
  if (radius <= 0) return gray;

  let current = gray;
  if (radius >= 2) current = medianGray(current, width, height, 1);
  return boxBlurGray(current, width, height, Math.min(6, radius));
}

export function blurGray(gray, width, height, radius = 1) {
  const safeRadius = Math.round(radius);
  if (safeRadius <= 0) return gray;
  return boxBlurGray(gray, width, height, Math.min(5, safeRadius));
}

function boxBlurGray(gray, width, height, radius) {
  const out = new Uint8Array(gray.length);
  const safeRadius = Math.max(1, Math.round(radius));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;
      for (let dy = -safeRadius; dy <= safeRadius; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -safeRadius; dx <= safeRadius; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          sum += gray[yy * width + xx];
          count++;
        }
      }
      out[y * width + x] = Math.round(sum / Math.max(1, count));
    }
  }

  return out;
}

function medianGray(gray, width, height, radius) {
  const out = new Uint8Array(gray.length);
  const values = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      values.length = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          values.push(gray[yy * width + xx]);
        }
      }
      values.sort((a, b) => a - b);
      out[y * width + x] = values[Math.floor(values.length / 2)] || gray[y * width + x];
    }
  }

  return out;
}

export function buildEdgeMask(gray, width, height, edgeQuantile) {
  const magnitudes = new Uint16Array(width * height);
  const samples = [];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const gx = -gray[i - width - 1] - 2 * gray[i - 1] - gray[i + width - 1] + gray[i - width + 1] + 2 * gray[i + 1] + gray[i + width + 1];
      const gy = -gray[i - width - 1] - 2 * gray[i - width] - gray[i - width + 1] + gray[i + width - 1] + 2 * gray[i + width] + gray[i + width + 1];
      const mag = Math.min(1020, Math.abs(gx) + Math.abs(gy));
      magnitudes[i] = mag;
      if (mag > 0 && i % 4 === 0) samples.push(mag);
    }
  }

  samples.sort((a, b) => a - b);
  const threshold = Math.max(35, Math.min(220, samples[Math.floor(samples.length * edgeQuantile)] || 60));
  const mask = new Uint8Array(width * height);

  for (let i = 0; i < magnitudes.length; i++) {
    if (magnitudes[i] >= threshold) mask[i] = 1;
  }

  return mask;
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}
