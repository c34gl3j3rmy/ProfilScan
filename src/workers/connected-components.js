import { traceBoundary } from './contour-tracer.js';

export function findComponents(mask, width, height, simplifyPoints) {
  const visited = new Uint8Array(mask.length);
  const components = [];
  const queue = [];

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || visited[start]) continue;

    const component = collectComponent(start, mask, visited, queue, width, height);
    const contour = traceBoundary(component.pixels, mask, width, height);

    components.push({
      x: component.minX,
      y: component.minY,
      width: component.maxX - component.minX + 1,
      height: component.maxY - component.minY + 1,
      area: component.count,
      closed: contour.closed,
      points: simplifyPoints(contour.points, 240)
    });
  }

  return components;
}

function collectComponent(start, mask, visited, queue, width, height) {
  let count = 0;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  const pixels = [];

  queue.length = 0;
  queue.push(start);
  visited[start] = 1;

  for (let q = 0; q < queue.length; q++) {
    const current = queue[q];
    const x = current % width;
    const y = Math.floor(current / width);

    count++;
    pixels.push({ x, y });
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);

    visitNeighbors(x, y, mask, visited, queue, width, height);
  }

  return { count, minX, minY, maxX, maxY, pixels };
}

function visitNeighbors(x, y, mask, visited, queue, width, height) {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;

      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || xx >= width || yy < 0 || yy >= height) continue;

      const next = yy * width + xx;
      if (!visited[next] && mask[next]) {
        visited[next] = 1;
        queue.push(next);
      }
    }
  }
}
