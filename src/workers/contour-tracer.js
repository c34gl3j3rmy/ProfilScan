export function traceBoundary(pixels, mask, width, height) {
  const loops = tracePixelEdgeLoops(pixels, mask, width, height);
  const classified = classifyLoops(loops);

  return {
    closed: classified.exterior.length > 0 && classified.all.every(contour => contour.closed),
    contours: classified.exterior,
    points: classified.exterior.flatMap(contour => contour.points),
    holes: classified.holes.map(contour => ({
      closed: contour.closed,
      contours: [contour],
      points: contour.points
    }))
  };
}

function tracePixelEdgeLoops(pixels, mask, width, height) {
  const edges = [];

  for (const pixel of pixels || []) {
    const x = pixel.x;
    const y = pixel.y;

    if (!isFilled(mask, width, height, x, y - 1)) {
      edges.push(makeEdge(x, y, x + 1, y));
    }
    if (!isFilled(mask, width, height, x + 1, y)) {
      edges.push(makeEdge(x + 1, y, x + 1, y + 1));
    }
    if (!isFilled(mask, width, height, x, y + 1)) {
      edges.push(makeEdge(x + 1, y + 1, x, y + 1));
    }
    if (!isFilled(mask, width, height, x - 1, y)) {
      edges.push(makeEdge(x, y + 1, x, y));
    }
  }

  return stitchEdgesIntoLoops(edges)
    .map(points => simplifyCollinear(points))
    .filter(points => points.length >= 4)
    .map(points => ({
      closed: samePoint(points[0], points[points.length - 1]),
      points: ensureClosed(points)
    }));
}

function stitchEdgesIntoLoops(edges) {
  const outgoing = new Map();
  const unused = new Set();

  edges.forEach((edge, index) => {
    unused.add(index);
    const key = pointKey(edge.x1, edge.y1);
    if (!outgoing.has(key)) outgoing.set(key, []);
    outgoing.get(key).push(index);
  });

  const loops = [];

  while (unused.size) {
    const firstIndex = unused.values().next().value;
    const firstEdge = edges[firstIndex];
    const start = { x: firstEdge.x1, y: firstEdge.y1 };
    const points = [start];

    let currentIndex = firstIndex;
    let previousDirection = edgeDirection(firstEdge);
    let guard = 0;

    while (unused.has(currentIndex) && guard++ <= edges.length + 1) {
      const edge = edges[currentIndex];
      unused.delete(currentIndex);

      const end = { x: edge.x2, y: edge.y2 };
      points.push(end);
      if (samePoint(end, start)) break;

      const candidates = (outgoing.get(pointKey(end.x, end.y)) || [])
        .filter(index => unused.has(index));

      if (!candidates.length) break;

      currentIndex = chooseContinuation(edges, candidates, previousDirection);
      previousDirection = edgeDirection(edges[currentIndex]);
    }

    if (samePoint(points[0], points[points.length - 1])) loops.push(points);
  }

  return loops;
}

function chooseContinuation(edges, candidateIndices, previousDirection) {
  if (candidateIndices.length === 1) return candidateIndices[0];

  let bestIndex = candidateIndices[0];
  let bestTurn = Infinity;

  for (const index of candidateIndices) {
    const direction = edgeDirection(edges[index]);
    const turn = clockwiseTurn(previousDirection, direction);
    if (turn < bestTurn) {
      bestTurn = turn;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function classifyLoops(loops) {
  const valid = loops
    .filter(contour => contour.closed && contour.points.length >= 4)
    .map(contour => ({
      ...contour,
      signedArea: polygonSignedArea(contour.points),
      absoluteArea: Math.abs(polygonSignedArea(contour.points))
    }))
    .filter(contour => contour.absoluteArea >= 1);

  if (!valid.length) return { all: [], exterior: [], holes: [] };

  const exterior = [];
  const holes = [];

  for (const contour of valid) {
    const point = representativePoint(contour.points);
    const nestingDepth = valid.reduce((depth, candidate) => {
      if (candidate === contour || candidate.absoluteArea <= contour.absoluteArea) return depth;
      return pointInPolygon(point.x, point.y, candidate.points) ? depth + 1 : depth;
    }, 0);

    const normalized = {
      closed: true,
      points: ensureClosed(contour.points)
    };

    if (nestingDepth % 2 === 0) exterior.push(normalized);
    else holes.push(normalized);
  }

  exterior.sort((a, b) => Math.abs(polygonSignedArea(b.points)) - Math.abs(polygonSignedArea(a.points)));
  holes.sort((a, b) => Math.abs(polygonSignedArea(b.points)) - Math.abs(polygonSignedArea(a.points)));

  return { all: [...exterior, ...holes], exterior, holes };
}

function simplifyCollinear(points) {
  if (!Array.isArray(points) || points.length < 4) return points || [];

  const closed = samePoint(points[0], points[points.length - 1]);
  const source = closed ? points.slice(0, -1) : [...points];
  const output = [];

  for (let index = 0; index < source.length; index++) {
    const previous = source[(index - 1 + source.length) % source.length];
    const current = source[index];
    const next = source[(index + 1) % source.length];

    const dx1 = current.x - previous.x;
    const dy1 = current.y - previous.y;
    const dx2 = next.x - current.x;
    const dy2 = next.y - current.y;

    if (dx1 * dy2 !== dy1 * dx2) output.push(current);
  }

  return ensureClosed(output);
}

function representativePoint(points) {
  const usable = points.slice(0, -1);
  const center = usable.reduce((sum, point) => ({
    x: sum.x + point.x,
    y: sum.y + point.y
  }), { x: 0, y: 0 });

  return {
    x: center.x / Math.max(1, usable.length),
    y: center.y / Math.max(1, usable.length)
  };
}

function pointInPolygon(x, y, points) {
  let inside = false;

  for (let index = 0, previousIndex = points.length - 1; index < points.length; previousIndex = index++) {
    const point = points[index];
    const previous = points[previousIndex];
    const crosses = (point.y > y) !== (previous.y > y);

    if (crosses) {
      const atX = ((previous.x - point.x) * (y - point.y)) /
        ((previous.y - point.y) || 1e-12) + point.x;
      if (x < atX) inside = !inside;
    }
  }

  return inside;
}

function polygonSignedArea(points) {
  let area = 0;
  for (let index = 0; index < points.length - 1; index++) {
    const current = points[index];
    const next = points[index + 1];
    area += current.x * next.y - next.x * current.y;
  }
  return area / 2;
}

function isFilled(mask, width, height, x, y) {
  return x >= 0 && x < width && y >= 0 && y < height && Boolean(mask[y * width + x]);
}

function makeEdge(x1, y1, x2, y2) {
  return { x1, y1, x2, y2 };
}

function edgeDirection(edge) {
  if (edge.x2 > edge.x1) return 0;
  if (edge.y2 > edge.y1) return 1;
  if (edge.x2 < edge.x1) return 2;
  return 3;
}

function clockwiseTurn(from, to) {
  return (to - from + 4) % 4;
}

function ensureClosed(points) {
  if (!points.length || samePoint(points[0], points[points.length - 1])) return points;
  return [...points, { ...points[0] }];
}

function samePoint(a, b) {
  return Boolean(a && b && a.x === b.x && a.y === b.y);
}

function pointKey(x, y) {
  return `${x},${y}`;
}
