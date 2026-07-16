import { traceBoundary } from '../contour-tracer.js';

export function dilate(mask, width, height, radius) {
  const output = new Uint8Array(mask.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let found = 0;

      for (let dy = -radius; dy <= radius && !found; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;

        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;

          if (xx >= 0 && xx < width && mask[yy * width + xx]) {
            found = 1;
            break;
          }
        }
      }

      output[y * width + x] = found;
    }
  }

  return output;
}

export function findComponents(mask, width, height) {
  const visited = new Uint8Array(mask.length);
  const components = [];
  const queue = [];

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || visited[start]) continue;

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

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;

          const xx = x + dx;
          const yy = y + dy;
          const next = yy * width + xx;

          if (
            xx >= 0
            && xx < width
            && yy >= 0
            && yy < height
            && !visited[next]
            && mask[next]
          ) {
            visited[next] = 1;
            queue.push(next);
          }
        }
      }
    }

    const contour = traceBoundary(pixels, mask, width, height);

    components.push({
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
      area: count,
      closed: contour.closed,
      contours: simplifyContours(contour.contours || [], 240),
      points: simplifyContourPoints(contour.points, 240),
      holes: (contour.holes || []).map(hole => ({
        closed: hole.closed,
        contours: simplifyContours(hole.contours || [], 160),
        points: simplifyContourPoints(hole.points, 160)
      }))
    });
  }

  return components;
}

export function simplifyContours(contours, maxPoints) {
  const source = contours || [];
  const total = source.reduce(
    (sum, contour) => sum + (contour.points?.length || 0),
    0
  ) || 1;

  return source
    .map(contour => ({
      closed: contour.closed !== false,
      points: samplePointList(
        contour.points || [],
        Math.max(
          2,
          Math.round(
            ((contour.points?.length || 0) / total) * maxPoints
          )
        )
      )
    }))
    .filter(contour => contour.points.length >= 2);
}

export function simplifyContourPoints(points, maxPoints) {
  if (!Array.isArray(points) || points.length <= maxPoints) {
    return points || [];
  }

  return samplePointList(points, maxPoints);
}

export function samplePointList(points, maxPoints) {
  if (!Array.isArray(points) || !points.length) return [];

  const count = Math.max(1, Math.min(maxPoints, points.length));
  const step = Math.max(1, points.length / count);
  const output = [];

  for (
    let i = 0;
    i < count && Math.floor(i * step) < points.length;
    i++
  ) {
    const point = points[Math.floor(i * step)];
    output.push({ x: point.x, y: point.y });
  }

  return output;
}

export function sampleMaskPoints(
  mask,
  width,
  height,
  scale,
  maxPoints
) {
  const all = [];

  for (let index = 0; index < mask.length; index++) {
    if (mask[index]) all.push(index);
  }

  const step = Math.max(1, Math.ceil(all.length / maxPoints));
  const points = [];

  for (let i = 0; i < all.length; i += step) {
    const index = all[i];

    points.push({
      x: Math.round((index % width) / scale),
      y: Math.round(Math.floor(index / width) / scale)
    });
  }

  return points;
}

export function scaleDetectedObject(object, scale) {
  const scalePoint = point => ({
    x: Math.round(point.x / scale),
    y: Math.round(point.y / scale)
  });

  const scaleContour = contour => ({
    closed: contour.closed !== false,
    points: contour.points.map(scalePoint)
  });

  return {
    x: Math.round(object.x / scale),
    y: Math.round(object.y / scale),
    width: Math.round(object.width / scale),
    height: Math.round(object.height / scale),
    area: Math.round(object.area / (scale * scale)),
    closed: object.closed,
    sectionCandidate: object.sectionCandidate,
    sectionScore: object.sectionScore || 0,
    contours: (object.contours || []).map(scaleContour),
    points: object.points.map(scalePoint),
    holes: (object.holes || []).map(hole => ({
      closed: hole.closed,
      contours: (hole.contours || []).map(scaleContour),
      points: hole.points.map(scalePoint)
    }))
  };
}

export function samplePoints(points, maxPoints) {
  if (!Array.isArray(points) || !points.length) return [];

  return samplePointList(points, maxPoints).map(point => ({
    x: roundNumber(point.x),
    y: roundNumber(point.y)
  }));
}

export function sampleContours(contours, maxPoints) {
  return simplifyContours(contours || [], maxPoints).map(contour => ({
    closed: contour.closed !== false,
    points: contour.points.map(point => ({
      x: roundNumber(point.x),
      y: roundNumber(point.y)
    }))
  }));
}

export function countMaskPixels(mask) {
  return mask.reduce((sum, value) => sum + value, 0);
}

function roundNumber(value) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.round(number * 1000000) / 1000000
    : null;
}
