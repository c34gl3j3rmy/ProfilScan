export function rasterizeContours(contours, gridSize) {
  const mask = new Uint8Array(gridSize * gridSize);
  const validContours = (contours || []).filter(contour => contour.points?.length >= 3);
  if (!validContours.length) return mask;

  for (let row = 0; row < gridSize; row++) {
    const y = -0.5 + (row + 0.5) / gridSize;
    for (let column = 0; column < gridSize; column++) {
      const x = -0.5 + (column + 0.5) / gridSize;
      if (isPointInsideContours(x, y, validContours)) {
        mask[row * gridSize + column] = 1;
      }
    }
  }

  return mask;
}

function isPointInsideContours(x, y, contours) {
  let inside = false;
  for (const contour of contours) {
    if (isPointInsidePolygon(x, y, contour.points)) inside = !inside;
  }
  return inside;
}

function isPointInsidePolygon(x, y, points) {
  let inside = false;

  for (let index = 0, previous = points.length - 1;
    index < points.length;
    previous = index++) {
    const a = points[index];
    const b = points[previous];
    if ((a.y > y) === (b.y > y)) continue;

    const intersectionX = ((b.x - a.x) * (y - a.y)) /
      ((b.y - a.y) || Number.EPSILON) + a.x;
    if (x < intersectionX) inside = !inside;
  }

  return inside;
}
