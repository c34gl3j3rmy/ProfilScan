export function buildCannyEdgeMask(gray, width, height, edgeQuantile) {
  const { magnitude, direction, samples } = computeGradients(gray, width, height);
  const suppressed = nonMaximumSuppression(magnitude, direction, width, height);
  const thresholds = chooseThresholds(samples, edgeQuantile);
  return hysteresis(suppressed, width, height, thresholds.low, thresholds.high);
}

function computeGradients(gray, width, height) {
  const magnitude = new Uint16Array(width * height);
  const direction = new Uint8Array(width * height);
  const samples = [];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const index = y * width + x;
      const gx = -gray[index - width - 1] - 2 * gray[index - 1] - gray[index + width - 1] + gray[index - width + 1] + 2 * gray[index + 1] + gray[index + width + 1];
      const gy = -gray[index - width - 1] - 2 * gray[index - width] - gray[index - width + 1] + gray[index + width - 1] + 2 * gray[index + width] + gray[index + width + 1];
      const mag = Math.min(1020, Math.abs(gx) + Math.abs(gy));
      magnitude[index] = mag;
      direction[index] = quantizeDirection(gx, gy);
      if (mag > 0 && index % 4 === 0) samples.push(mag);
    }
  }

  samples.sort((a, b) => a - b);
  return { magnitude, direction, samples };
}

function quantizeDirection(gx, gy) {
  const angle = Math.atan2(gy, gx) * 180 / Math.PI;
  const normalized = angle < 0 ? angle + 180 : angle;
  if (normalized < 22.5 || normalized >= 157.5) return 0;
  if (normalized < 67.5) return 45;
  if (normalized < 112.5) return 90;
  return 135;
}

function nonMaximumSuppression(magnitude, direction, width, height) {
  const output = new Uint16Array(magnitude.length);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const index = y * width + x;
      const current = magnitude[index];
      if (!current) continue;

      const [a, b] = neighborOffsets(direction[index], width);
      if (current >= magnitude[index + a] && current >= magnitude[index + b]) output[index] = current;
    }
  }

  return output;
}

function neighborOffsets(direction, width) {
  if (direction === 0) return [-1, 1];
  if (direction === 45) return [-width + 1, width - 1];
  if (direction === 90) return [-width, width];
  return [-width - 1, width + 1];
}

function chooseThresholds(samples, edgeQuantile) {
  if (!samples.length) return { low: 28, high: 70 };
  const high = Math.max(35, Math.min(260, samples[Math.floor(samples.length * edgeQuantile)] || 70));
  const low = Math.max(18, Math.round(high * 0.42));
  return { low, high };
}

function hysteresis(magnitude, width, height, low, high) {
  const mask = new Uint8Array(magnitude.length);
  const visited = new Uint8Array(magnitude.length);
  const queue = [];

  for (let index = 0; index < magnitude.length; index++) {
    if (visited[index] || magnitude[index] < high) continue;
    visited[index] = 1;
    mask[index] = 1;
    queue.length = 0;
    queue.push(index);

    for (let q = 0; q < queue.length; q++) {
      const current = queue[q];
      const x = current % width;
      const y = Math.floor(current / width);

      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy <= 0 || yy >= height - 1) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const xx = x + dx;
          if (xx <= 0 || xx >= width - 1) continue;
          const next = yy * width + xx;
          if (visited[next] || magnitude[next] < low) continue;
          visited[next] = 1;
          mask[next] = 1;
          queue.push(next);
        }
      }
    }
  }

  return mask;
}
