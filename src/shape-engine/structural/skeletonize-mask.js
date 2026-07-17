export function thinMask(source, gridSize) {
  const mask = Uint8Array.from(source || []);
  if (mask.length !== gridSize * gridSize) return new Uint8Array(gridSize * gridSize);

  let changed = true;
  while (changed) {
    changed = removePass(mask, gridSize, 0);
    changed = removePass(mask, gridSize, 1) || changed;
  }

  return mask;
}

function removePass(mask, size, pass) {
  const removals = [];

  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const index = y * size + x;
      if (!mask[index]) continue;

      const neighbors = neighborhood(mask, size, x, y);
      const count = neighbors.reduce((sum, value) => sum + value, 0);
      if (count < 2 || count > 6 || transitions(neighbors) !== 1) continue;

      const [p2, p3, p4, p5, p6, p7, p8, p9] = neighbors;
      const firstConstraint = pass === 0
        ? p2 * p4 * p6 === 0 && p4 * p6 * p8 === 0
        : p2 * p4 * p8 === 0 && p2 * p6 * p8 === 0;

      if (firstConstraint) removals.push(index);
    }
  }

  for (const index of removals) mask[index] = 0;
  return removals.length > 0;
}

function neighborhood(mask, size, x, y) {
  return [
    mask[(y - 1) * size + x],
    mask[(y - 1) * size + x + 1],
    mask[y * size + x + 1],
    mask[(y + 1) * size + x + 1],
    mask[(y + 1) * size + x],
    mask[(y + 1) * size + x - 1],
    mask[y * size + x - 1],
    mask[(y - 1) * size + x - 1]
  ];
}

function transitions(neighbors) {
  let count = 0;
  for (let index = 0; index < neighbors.length; index++) {
    if (!neighbors[index] && neighbors[(index + 1) % neighbors.length]) count++;
  }
  return count;
}
