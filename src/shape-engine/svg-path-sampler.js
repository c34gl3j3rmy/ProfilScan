export function sampleSvgPathPolyline(pathText, options = {}) {
  return flattenContours(sampleSvgPathContours(pathText, options));
}

export function sampleSvgPathContours(pathText, options = {}) {
  const tokens = tokenizePath(pathText);
  const maxSegmentLength = clampPositive(options.maxSegmentLength, 0.8);
  const minSteps = Math.max(1, Math.round(options.minSteps ?? 1));
  const contours = [];
  let contour = [];
  let index = 0;
  let command = '';
  let current = { x: 0, y: 0 };
  let start = { x: 0, y: 0 };

  while (index < tokens.length) {
    if (isCommand(tokens[index])) command = tokens[index++];
    if (!command) break;

    const upper = command.toUpperCase();
    const relative = command !== upper;

    if (upper === 'M') {
      pushCurrentContour(contours, contour, false);
      current = resolvePoint(readNumber(tokens, index++), readNumber(tokens, index++), current, relative);
      start = current;
      contour = [{ ...current }];
      command = relative ? 'l' : 'L';
      continue;
    }

    if (upper === 'L') {
      const next = resolvePoint(readNumber(tokens, index++), readNumber(tokens, index++), current, relative);
      pushLine(contour, current, next, maxSegmentLength, minSteps);
      current = next;
      continue;
    }

    if (upper === 'H') {
      const x = readNumber(tokens, index++);
      const next = { x: relative ? current.x + x : x, y: current.y };
      pushLine(contour, current, next, maxSegmentLength, minSteps);
      current = next;
      continue;
    }

    if (upper === 'V') {
      const y = readNumber(tokens, index++);
      const next = { x: current.x, y: relative ? current.y + y : y };
      pushLine(contour, current, next, maxSegmentLength, minSteps);
      current = next;
      continue;
    }

    if (upper === 'A') {
      const rx = readNumber(tokens, index++);
      const ry = readNumber(tokens, index++);
      const xAxisRotation = readNumber(tokens, index++);
      const largeArcFlag = readNumber(tokens, index++);
      const sweepFlag = readNumber(tokens, index++);
      const next = resolvePoint(readNumber(tokens, index++), readNumber(tokens, index++), current, relative);
      pushArc(contour, current, next, rx, ry, xAxisRotation, largeArcFlag, sweepFlag, maxSegmentLength, minSteps);
      current = next;
      continue;
    }

    if (upper === 'C') {
      const c1 = resolvePoint(readNumber(tokens, index++), readNumber(tokens, index++), current, relative);
      const c2 = resolvePoint(readNumber(tokens, index++), readNumber(tokens, index++), current, relative);
      const next = resolvePoint(readNumber(tokens, index++), readNumber(tokens, index++), current, relative);
      pushCubic(contour, current, c1, c2, next, maxSegmentLength, minSteps);
      current = next;
      continue;
    }

    if (upper === 'S') {
      index += 2;
      const c2 = resolvePoint(readNumber(tokens, index++), readNumber(tokens, index++), current, relative);
      const next = resolvePoint(readNumber(tokens, index++), readNumber(tokens, index++), current, relative);
      pushQuadraticLike(contour, current, c2, next, maxSegmentLength, minSteps);
      current = next;
      continue;
    }

    if (upper === 'Q') {
      const control = resolvePoint(readNumber(tokens, index++), readNumber(tokens, index++), current, relative);
      const next = resolvePoint(readNumber(tokens, index++), readNumber(tokens, index++), current, relative);
      pushQuadraticLike(contour, current, control, next, maxSegmentLength, minSteps);
      current = next;
      continue;
    }

    if (upper === 'T') {
      const next = resolvePoint(readNumber(tokens, index++), readNumber(tokens, index++), current, relative);
      pushLine(contour, current, next, maxSegmentLength, minSteps);
      current = next;
      continue;
    }

    if (upper === 'Z') {
      pushLine(contour, current, start, maxSegmentLength, minSteps);
      current = start;
      pushCurrentContour(contours, contour, true);
      contour = [];
      command = '';
      continue;
    }

    index++;
  }

  pushCurrentContour(contours, contour, false);
  return contours;
}

function flattenContours(contours) {
  const output = [];
  for (const contour of contours || []) {
    const points = contour.points || [];
    points.forEach((point, index) => output.push({
      x: point.x,
      y: point.y,
      breakBefore: output.length > 0 && index === 0,
      closed: Boolean(contour.closed)
    }));
  }
  return output;
}

function pushCurrentContour(contours, contour, closed) {
  if (!contour?.length) return;
  const points = normalizeContourClosure(contour, closed);
  if (points.length < 2) return;
  contours.push({
    points,
    closed: Boolean(closed || samePoint(points[0], points[points.length - 1])),
    source: 'svg-subpath'
  });
}

function normalizeContourClosure(points, closed) {
  const output = points.map(point => ({ x: point.x, y: point.y }));
  if (closed && output.length && !samePoint(output[0], output[output.length - 1])) {
    output.push({ ...output[0] });
  }
  return output;
}

function tokenizePath(pathText) {
  return String(pathText).match(/[AaCcHhLlMmQqSsTtVvZz]|[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g) || [];
}

function isCommand(value) {
  return /^[A-Za-z]$/.test(value);
}

function readNumber(tokens, index) {
  const value = Number(tokens[index]);
  return Number.isFinite(value) ? value : 0;
}

function resolvePoint(x, y, current, relative) {
  return relative ? { x: current.x + x, y: current.y + y } : { x, y };
}

function pushLine(points, from, to, maxSegmentLength, minSteps) {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(minSteps, Math.ceil(distance / maxSegmentLength));
  for (let index = 1; index <= steps; index++) {
    const t = index / steps;
    points.push({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
  }
}

function pushCubic(points, from, c1, c2, to, maxSegmentLength, minSteps) {
  const estimatedLength = Math.hypot(c1.x - from.x, c1.y - from.y) + Math.hypot(c2.x - c1.x, c2.y - c1.y) + Math.hypot(to.x - c2.x, to.y - c2.y);
  const steps = Math.max(6, minSteps, Math.ceil(estimatedLength / maxSegmentLength));
  for (let index = 1; index <= steps; index++) {
    const t = index / steps;
    const mt = 1 - t;
    points.push({
      x: mt ** 3 * from.x + 3 * mt ** 2 * t * c1.x + 3 * mt * t ** 2 * c2.x + t ** 3 * to.x,
      y: mt ** 3 * from.y + 3 * mt ** 2 * t * c1.y + 3 * mt * t ** 2 * c2.y + t ** 3 * to.y
    });
  }
}

function pushQuadraticLike(points, from, control, to, maxSegmentLength, minSteps) {
  const estimatedLength = Math.hypot(control.x - from.x, control.y - from.y) + Math.hypot(to.x - control.x, to.y - control.y);
  const steps = Math.max(4, minSteps, Math.ceil(estimatedLength / maxSegmentLength));
  for (let index = 1; index <= steps; index++) {
    const t = index / steps;
    const mt = 1 - t;
    points.push({
      x: mt ** 2 * from.x + 2 * mt * t * control.x + t ** 2 * to.x,
      y: mt ** 2 * from.y + 2 * mt * t * control.y + t ** 2 * to.y
    });
  }
}

function pushArc(points, from, to, rx, ry, xAxisRotation, largeArcFlag, sweepFlag, maxSegmentLength, minSteps) {
  if (!rx || !ry || samePoint(from, to)) {
    pushLine(points, from, to, maxSegmentLength, minSteps);
    return;
  }

  const params = endpointArcToCenter(from, to, Math.abs(rx), Math.abs(ry), xAxisRotation, Boolean(largeArcFlag), Boolean(sweepFlag));
  if (!params) {
    pushLine(points, from, to, maxSegmentLength, minSteps);
    return;
  }

  const arcLength = estimateArcLength(params);
  const steps = Math.max(6, minSteps, Math.ceil(arcLength / maxSegmentLength));
  const cosPhi = Math.cos(params.phi);
  const sinPhi = Math.sin(params.phi);

  for (let index = 1; index <= steps; index++) {
    const angle = params.startAngle + params.deltaAngle * (index / steps);
    const x = params.cx + params.rx * Math.cos(angle) * cosPhi - params.ry * Math.sin(angle) * sinPhi;
    const y = params.cy + params.rx * Math.cos(angle) * sinPhi + params.ry * Math.sin(angle) * cosPhi;
    points.push({ x, y });
  }
}

function estimateArcLength(params) {
  const steps = Math.max(12, Math.ceil(Math.abs(params.deltaAngle) / (Math.PI / 24)));
  let length = 0;
  let previous = ellipsePoint(params, 0);
  for (let index = 1; index <= steps; index++) {
    const current = ellipsePoint(params, index / steps);
    length += Math.hypot(current.x - previous.x, current.y - previous.y);
    previous = current;
  }
  return length;
}

function ellipsePoint(params, t) {
  const angle = params.startAngle + params.deltaAngle * t;
  const cosPhi = Math.cos(params.phi);
  const sinPhi = Math.sin(params.phi);
  return {
    x: params.cx + params.rx * Math.cos(angle) * cosPhi - params.ry * Math.sin(angle) * sinPhi,
    y: params.cy + params.rx * Math.cos(angle) * sinPhi + params.ry * Math.sin(angle) * cosPhi
  };
}

function endpointArcToCenter(from, to, rx, ry, rotationDegrees, largeArc, sweep) {
  const phi = (rotationDegrees * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const dx = (from.x - to.x) / 2;
  const dy = (from.y - to.y) / 2;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;

  let rxs = rx * rx;
  let rys = ry * ry;
  const x1ps = x1p * x1p;
  const y1ps = y1p * y1p;
  const lambda = x1ps / rxs + y1ps / rys;

  if (lambda > 1) {
    const scale = Math.sqrt(lambda);
    rx *= scale;
    ry *= scale;
    rxs = rx * rx;
    rys = ry * ry;
  }

  const sign = largeArc === sweep ? -1 : 1;
  const numerator = Math.max(0, rxs * rys - rxs * y1ps - rys * x1ps);
  const denominator = rxs * y1ps + rys * x1ps;
  if (!denominator) return null;

  const coefficient = sign * Math.sqrt(numerator / denominator);
  const cxp = coefficient * ((rx * y1p) / ry);
  const cyp = coefficient * (-(ry * x1p) / rx);
  const cx = cosPhi * cxp - sinPhi * cyp + (from.x + to.x) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (from.y + to.y) / 2;

  const startVector = { x: (x1p - cxp) / rx, y: (y1p - cyp) / ry };
  const endVector = { x: (-x1p - cxp) / rx, y: (-y1p - cyp) / ry };
  const startAngle = vectorAngle({ x: 1, y: 0 }, startVector);
  let deltaAngle = vectorAngle(startVector, endVector);

  if (!sweep && deltaAngle > 0) deltaAngle -= Math.PI * 2;
  if (sweep && deltaAngle < 0) deltaAngle += Math.PI * 2;

  return { cx, cy, rx, ry, phi, startAngle, deltaAngle };
}

function vectorAngle(a, b) {
  const dot = a.x * b.x + a.y * b.y;
  const det = a.x * b.y - a.y * b.x;
  return Math.atan2(det, dot);
}

function samePoint(a, b) {
  return Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;
}

function clampPositive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}
