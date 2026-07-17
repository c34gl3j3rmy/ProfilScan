const DEFAULT_GRID_SIZE = 64;

export function buildFilledShape(contours, gridSize = DEFAULT_GRID_SIZE) {
  const size = positiveInteger(gridSize, DEFAULT_GRID_SIZE);
  const validContours = normalizeValidContours(contours);

  if (!validContours.length) {
    return {
      points: [],
      fillRatio: 0,
      gridSize: size
    };
  }

  const points = [];
  const step = 1 / size;
  const start = -0.5 + step / 2;

  for (let yIndex = 0; yIndex < size; yIndex++) {
    const y = start + yIndex * step;

    for (let xIndex = 0; xIndex < size; xIndex++) {
      const x = start + xIndex * step;
      if (isPointInsideContours(x, y, validContours)) points.push({ x, y });
    }
  }

  return {
    points,
    fillRatio: points.length / (size * size),
    gridSize: size
  };
}

export function isPointInsideContours(x, y, contours) {
  let inside = false;

  for (const contour of normalizeValidContours(contours)) {
    if (isPointInsidePolygon(x, y, contour.points)) inside = !inside;
  }

  return inside;
}

export function isPointInsidePolygon(x, y, points) {
  let inside = false;

  for (
    let index = 0, previousIndex = points.length - 1;
    index < points.length;
    previousIndex = index++
  ) {
    const current = points[index];
    const previous = points[previousIndex];
    const crosses = (current.y > y) !== (previous.y > y);

    if (crosses) {
      const intersectionX = ((previous.x - current.x) * (y - current.y)) /
        ((previous.y - current.y) || 1e-12) + current.x;
      if (x < intersectionX) inside = !inside;
    }
  }

  return inside;
}

function normalizeValidContours(contours) {
  return (Array.isArray(contours) ? contours : [])
    .map(contour => ({
      points: (contour?.points || contour || [])
        .map(point => ({ x: Number(point?.x), y: Number(point?.y) }))
        .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y))
    }))
    .filter(contour => contour.points.length >= 3);
}

function positiveInteger(value, fallback) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}
