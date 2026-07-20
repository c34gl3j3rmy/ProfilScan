export function analyzeSkeleton(mask, gridSize) {
  let skeletonPixels = 0;
  let endpoints = 0;
  let junctions = 0;

  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const index = y * gridSize + x;
      if (!mask[index]) continue;

      skeletonPixels++;
      const degree = countNeighbors(mask, gridSize, x, y);
      if (degree === 1) endpoints++;
      if (degree >= 3) junctions++;
    }
  }

  return {
    skeletonPixels,
    endpoints,
    junctions,
    components: countComponents(mask, gridSize),
    endpointRatio: skeletonPixels ? endpoints / skeletonPixels : 0,
    junctionRatio: skeletonPixels ? junctions / skeletonPixels : 0
  };
}

function countComponents(mask, size) {
  const visited = new Uint8Array(mask.length);
  let components = 0;

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || visited[start]) continue;
    components++;
    const queue = [start];
    visited[start] = 1;

    for (let cursor = 0; cursor < queue.length; cursor++) {
      const index = queue[cursor];
      const x = index % size;
      const y = Math.floor(index / size);

      forEachNeighbor(size, x, y, neighbor => {
        if (mask[neighbor] && !visited[neighbor]) {
          visited[neighbor] = 1;
          queue.push(neighbor);
        }
      });
    }
  }

  return components;
}

function countNeighbors(mask, size, x, y) {
  let count = 0;
  forEachNeighbor(size, x, y, index => {
    count += mask[index] ? 1 : 0;
  });
  return count;
}

function forEachNeighbor(size, x, y, callback) {
  for (let offsetY = -1; offsetY <= 1; offsetY++) {
    for (let offsetX = -1; offsetX <= 1; offsetX++) {
      if (!offsetX && !offsetY) continue;
      const nextX = x + offsetX;
      const nextY = y + offsetY;
      if (nextX < 0 || nextY < 0 || nextX >= size || nextY >= size) continue;
      callback(nextY * size + nextX);
    }
  }
}
