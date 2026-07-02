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

export function blurGray(gray, width, height) {
  const out = new Uint8Array(gray.length);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      out[i] = Math.round((
        gray[i] * 4 +
        gray[i - 1] * 2 +
        gray[i + 1] * 2 +
        gray[i - width] * 2 +
        gray[i + width] * 2 +
        gray[i - width - 1] +
        gray[i - width + 1] +
        gray[i + width - 1] +
        gray[i + width + 1]
      ) / 16);
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
