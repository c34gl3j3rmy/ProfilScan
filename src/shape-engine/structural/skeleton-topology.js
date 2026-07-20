export function analyzeSkeleton(mask, gridSize) {
  let skeletonPixels = 0;
  const endpointMask = new Uint8Array(mask.length);
  const junctionMask = new Uint8Array(mask.length);

  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const index = y * gridSize + x;
      if (!mask[index]) continue;

      skeletonPixels++;
      const degree = countNeighbors(mask, gridSize, x, y);
      if (degree === 1) endpointMask[index] = 1;
      if (degree >= 3) junctionMask[index] = 1;
    }
  }

  const endpointClusters = collectClusters(endpointMask, gridSize);
  const junctionClusters = collectClusters(junctionMask, gridSize);

  return {
    skeletonPixels,
    endpoints: endpointClusters.length,
    junctions: junctionClusters.length,
    components: countComponents(mask, gridSize),
    endpointRatio: skeletonPixels ? endpointClusters.length / skeletonPixels : 0,
    junctionRatio: skeletonPixels ? junctionClusters.length / skeletonPixels : 0,
    endpointPositions: normalizeClusterPositions(endpointClusters, gridSize),
    junctionPositions: normalizeClusterPositions(junctionClusters, gridSize),
    endpointDistribution: buildSpatialDistribution(endpointClusters, gridSize),
    junctionDistribution: buildSpatialDistribution(junctionClusters, gridSize)
  };
}

function collectClusters(mask, size) {
  const visited = new Uint8Array(mask.length);
  const clusters = [];

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || visited[start]) continue;

    const queue = [start];
    const pixels = [];
    visited[start] = 1;

    for (let cursor = 0; cursor < queue.length; cursor++) {
      const index = queue[cursor];
      pixels.push(index);
      const x = index % size;
      const y = Math.floor(index / size);

      forEachNeighbor(size, x, y, neighbor => {
        if (mask[neighbor] && !visited[neighbor]) {
          visited[neighbor] = 1;
          queue.push(neighbor);
        }
      });
    }

    clusters.push(pixels);
  }

  return clusters;
}

function normalizeClusterPositions(clusters, size) {
  const scale = Math.max(1, size - 1);
  return clusters.map(cluster => {
    let sumX = 0;
    let sumY = 0;

    for (const index of cluster) {
      sumX += index % size;
      sumY += Math.floor(index / size);
    }

    return {
      x: sumX / cluster.length / scale,
      y: sumY / cluster.length / scale
    };
  });
}

function buildSpatialDistribution(clusters, size) {
  const distribution = {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    center: 0
  };

  for (const position of normalizeClusterPositions(clusters, size)) {
    const dx = position.x - 0.5;
    const dy = position.y - 0.5;

    if (Math.abs(dx) < 0.2 && Math.abs(dy) < 0.2) {
      distribution.center++;
    } else if (Math.abs(dx) > Math.abs(dy)) {
      distribution[dx < 0 ? 'left' : 'right']++;
    } else {
      distribution[dy < 0 ? 'top' : 'bottom']++;
    }
  }

  const total = Math.max(1, clusters.length);
  return Object.fromEntries(
    Object.entries(distribution).map(([key, value]) => [key, value / total])
  );
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
