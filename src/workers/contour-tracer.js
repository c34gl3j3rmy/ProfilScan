const DIRECTIONS = [
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: 0 },
  { x: -1, y: -1 },
  { x: 0, y: -1 },
  { x: 1, y: -1 }
];

export function traceBoundary(pixels, mask, width, height) {
  const boundarySet = new Set();
  let start = null;

  for (const point of pixels) {
    if (!isBoundary(point.x, point.y, mask, width, height)) continue;
    boundarySet.add(pointKey(point.x, point.y));
    if (!start || point.y < start.y || (point.y === start.y && point.x < start.x)) start = point;
  }

  if (!start) return { closed: false, points: [] };

  const contour = [start];
  let current = start;
  let direction = 4;
  const maxSteps = Math.min(boundarySet.size * 3, 2500);

  for (let step = 0; step < maxSteps; step++) {
    const next = findNext(current, direction, boundarySet);
    if (!next) break;

    if (next.x === start.x && next.y === start.y && contour.length > 8) {
      return { closed: true, points: contour };
    }

    contour.push({ x: next.x, y: next.y });
    current = next;
    direction = next.direction;
  }

  return {
    closed: false,
    points: contour.length > 2 ? contour : sortPoints([...boundarySet].map(pointFromKey))
  };
}

function findNext(current, previousDirection, boundarySet) {
  const startDirection = (previousDirection + 6) % 8;
  for (let offset = 0; offset < 8; offset++) {
    const directionIndex = (startDirection + offset) % 8;
    const direction = DIRECTIONS[directionIndex];
    const x = current.x + direction.x;
    const y = current.y + direction.y;
    if (boundarySet.has(pointKey(x, y))) return { x, y, direction: directionIndex };
  }
  return null;
}

function isBoundary(x, y, mask, width, height) {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || xx >= width || yy < 0 || yy >= height || !mask[yy * width + xx]) return true;
    }
  }
  return false;
}

function sortPoints(points) {
  if (points.length <= 2) return points;
  const center = points.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
  center.x /= points.length;
  center.y /= points.length;
  return points.sort((a, b) => Math.atan2(a.y - center.y, a.x - center.x) - Math.atan2(b.y - center.y, b.x - center.x));
}

function pointKey(x, y) {
  return `${x},${y}`;
}

function pointFromKey(key) {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
}
