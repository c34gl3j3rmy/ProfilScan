export function buildProjections(mask, gridSize, binCount) {
  const horizontal = new Array(binCount).fill(0);
  const vertical = new Array(binCount).fill(0);

  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      if (!mask[y * gridSize + x]) continue;
      horizontal[Math.min(binCount - 1, Math.floor(y * binCount / gridSize))]++;
      vertical[Math.min(binCount - 1, Math.floor(x * binCount / gridSize))]++;
    }
  }

  return {
    horizontal: normalize(horizontal),
    vertical: normalize(vertical)
  };
}

export function buildOrientationHistogram(skeleton, gridSize, binCount = 8) {
  const bins = new Array(binCount).fill(0);

  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      if (!skeleton[y * gridSize + x]) continue;

      for (const [offsetX, offsetY] of [[1, 0], [1, 1], [0, 1], [-1, 1]]) {
        const nextX = x + offsetX;
        const nextY = y + offsetY;
        if (nextX < 0 || nextY < 0 || nextX >= gridSize || nextY >= gridSize) continue;
        if (!skeleton[nextY * gridSize + nextX]) continue;

        const angle = Math.atan2(offsetY, offsetX) + Math.PI;
        const bin = Math.min(binCount - 1, Math.floor(angle / (Math.PI * 2) * binCount));
        bins[bin]++;
      }
    }
  }

  return normalize(bins);
}

function normalize(values) {
  const total = values.reduce((sum, value) => sum + value, 0);
  return total ? values.map(value => value / total) : values;
}
