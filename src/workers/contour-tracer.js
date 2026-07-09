const DIRECTIONS = [
  { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: -1, y: 1 },
  { x: -1, y: 0 }, { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 }
];

export function traceBoundary(pixels, mask, width, height) {
  const boundarySet = buildBoundarySet(pixels, mask, width, height);
  const exterior = traceSet(boundarySet);
  const holes = findHoleContours(pixels, mask, width, height);

  return {
    closed: exterior.closed,
    contours: exterior.contours,
    points: exterior.points,
    holes
  };
}

function buildBoundarySet(pixels, mask, width, height) {
  const set = new Set();
  for (const point of pixels) {
    if (isBoundary(point.x, point.y, mask, width, height)) set.add(pointKey(point.x, point.y));
  }
  return set;
}

function traceSet(boundarySet) {
  const visited = new Set();
  const contours = [];
  let start = firstUnvisitedPoint(boundarySet, visited);

  while (start) {
    const contour = traceContour(boundarySet, start, visited);
    if (contour.points.length > 2) {
      contours.push({
        closed: contour.closed,
        points: contour.closed ? closePoints(contour.points) : contour.points
      });
    }
    start = firstUnvisitedPoint(boundarySet, visited);
  }

  return {
    closed: contours.length > 0 && contours.every(contour => contour.closed),
    contours,
    points: contours.flatMap(contour => contour.points)
  };
}

function traceContour(boundarySet, start, globalVisited) {
  const contour = [start];
  const startKey = pointKey(start.x, start.y);
  globalVisited.add(startKey);
  let current = start;
  let direction = 4;
  const maxSteps = Math.min(boundarySet.size * 4, 5000);

  for (let step = 0; step < maxSteps; step++) {
    const next = findNext(current, direction, boundarySet, globalVisited, start, contour.length > 8);
    if (!next) break;

    if (next.x === start.x && next.y === start.y && contour.length > 8) {
      return { closed: true, points: contour };
    }

    contour.push({ x: next.x, y: next.y });
    globalVisited.add(pointKey(next.x, next.y));
    current = next;
    direction = next.direction;
  }

  return { closed: false, points: contour };
}

function findNext(current, previousDirection, boundarySet, visited, start, canClose) {
  const startDirection = (previousDirection + 6) % 8;
  for (let offset = 0; offset < 8; offset++) {
    const directionIndex = (startDirection + offset) % 8;
    const direction = DIRECTIONS[directionIndex];
    const x = current.x + direction.x;
    const y = current.y + direction.y;
    const key = pointKey(x, y);
    if (!boundarySet.has(key)) continue;
    if (canClose && x === start.x && y === start.y) return { x, y, direction: directionIndex };
    if (!visited.has(key)) return { x, y, direction: directionIndex };
  }
  return null;
}

function findHoleContours(pixels, mask, width, height) {
  const bounds = getBounds(pixels, width, height);
  const visited = new Set();
  const holes = [];

  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      const key = pointKey(x, y);
      if (visited.has(key) || mask[y * width + x]) continue;

      const region = collectBackgroundRegion(x, y, mask, width, height, bounds, visited);
      if (region.touchesBorder || region.points.length < 8) continue;

      const contour = traceSet(buildHoleBoundarySet(region.points, mask, width, height));
      if (contour.points.length > 2) holes.push({ closed: contour.closed, contours: contour.contours, points: contour.points });
    }
  }

  return holes.slice(0, 20);
}

function collectBackgroundRegion(startX, startY, mask, width, height, bounds, visited) {
  const queue = [{ x: startX, y: startY }];
  const points = [];
  let touchesBorder = false;
  visited.add(pointKey(startX, startY));

  for (let index = 0; index < queue.length; index++) {
    const point = queue[index];
    points.push(point);
    if (point.x === bounds.minX || point.x === bounds.maxX || point.y === bounds.minY || point.y === bounds.maxY) touchesBorder = true;

    for (const direction of DIRECTIONS) {
      const x = point.x + direction.x;
      const y = point.y + direction.y;
      if (x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY) continue;
      const key = pointKey(x, y);
      if (!visited.has(key) && !mask[y * width + x]) {
        visited.add(key);
        queue.push({ x, y });
      }
    }
  }

  return { points, touchesBorder };
}

function buildHoleBoundarySet(backgroundPoints, mask, width, height) {
  const set = new Set();
  for (const point of backgroundPoints) {
    for (const direction of DIRECTIONS) {
      const x = point.x + direction.x;
      const y = point.y + direction.y;
      if (x >= 0 && x < width && y >= 0 && y < height && mask[y * width + x]) set.add(pointKey(x, y));
    }
  }
  return set;
}

function closePoints(points) {
  if (points.length < 3) return points;
  const first = points[0];
  const last = points[points.length - 1];
  if (first.x === last.x && first.y === last.y) return points;
  return [...points, { x: first.x, y: first.y }];
}

function getBounds(pixels, width, height) {
  let minX = width, minY = height, maxX = 0, maxY = 0;
  for (const point of pixels) {
    minX = Math.min(minX, point.x); minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y);
  }
  return { minX, minY, maxX, maxY };
}

function firstUnvisitedPoint(set, visited) {
  let first = null;
  for (const key of set) {
    if (visited.has(key)) continue;
    const point = pointFromKey(key);
    if (!first || point.y < first.y || (point.y === first.y && point.x < first.x)) first = point;
  }
  return first;
}

function isBoundary(x, y, mask, width, height) {
  for (const direction of DIRECTIONS) {
    const xx = x + direction.x;
    const yy = y + direction.y;
    if (xx < 0 || xx >= width || yy < 0 || yy >= height || !mask[yy * width + xx]) return true;
  }
  return false;
}

function pointKey(x, y) {
  return `${x},${y}`;
}

function pointFromKey(key) {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
}
