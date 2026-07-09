export function renderPipelinePreview(canvas, profile, fingerprint) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const size = Math.min(canvas.width || 360, canvas.height || 360);
  canvas.width = size;
  canvas.height = size;

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#f9fafb';
  ctx.fillRect(0, 0, size, size);

  const contourPoints = fingerprint?.contour?.normalizedPoints || [];
  const signaturePoints = fingerprint?.descriptors?.points || contourPoints;
  const points = contourPoints.length ? contourPoints : signaturePoints;
  if (!points.length) {
    drawGrid(ctx, size, 8);
    drawMessage(ctx, size, 'Aucun point signature');
    return;
  }

  const scale = size * 0.82;
  const toCanvas = point => ({
    x: size / 2 + point.x * scale,
    y: size / 2 - point.y * scale
  });

  drawMaterialGrid(ctx, size, contourPoints, fingerprint?.pipelineSettings?.fillGridSize || fingerprint?.summary?.fillGridSize || 96);
  drawGrid(ctx, size, visibleGridCount(fingerprint?.pipelineSettings?.fillGridSize || 96));
  drawContour(ctx, contourPoints, toCanvas, size);
  drawSignaturePoints(ctx, signaturePoints, toCanvas, size);
  drawBreakMarkers(ctx, points, toCanvas, size);
  drawCaption(ctx, size, profile, fingerprint);
}

function drawMaterialGrid(ctx, size, points, gridSize) {
  const normalizedGridSize = clampGridSize(gridSize);
  const contours = splitContours(points).filter(contour => contour.length >= 3 && isDrawableContour(contour));
  const cellSize = size / normalizedGridSize;
  const step = 1 / normalizedGridSize;
  const start = -0.5 + step / 2;

  ctx.save();
  ctx.fillStyle = 'rgba(37, 99, 235, 0.18)';

  for (let yIndex = 0; yIndex < normalizedGridSize; yIndex++) {
    const y = start + yIndex * step;
    for (let xIndex = 0; xIndex < normalizedGridSize; xIndex++) {
      const x = start + xIndex * step;
      if (!isPointInsideContours(x, y, contours)) continue;
      ctx.fillRect(xIndex * cellSize, (normalizedGridSize - 1 - yIndex) * cellSize, Math.max(0.8, cellSize), Math.max(0.8, cellSize));
    }
  }

  ctx.restore();
}

function drawContour(ctx, points, toCanvas, size) {
  ctx.save();
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = Math.max(1.5, size / 180);

  for (const contour of splitContours(points)) {
    if (contour.length < 2) continue;
    const jumpLimit = estimateJumpLimit(contour);
    ctx.beginPath();
    let started = false;

    contour.forEach((point, index) => {
      const canvasPoint = toCanvas(point);
      const previous = contour[index - 1];
      const shouldBreak = index === 0 || point.breakBefore || (previous && distance(previous, point) > jumpLimit);
      if (!started || shouldBreak) {
        ctx.moveTo(canvasPoint.x, canvasPoint.y);
        started = true;
      } else ctx.lineTo(canvasPoint.x, canvasPoint.y);
    });

    if (isClosedContour(contour) && distance(contour[0], contour[contour.length - 1]) <= jumpLimit) ctx.closePath();
    ctx.stroke();
  }

  ctx.restore();
}

function drawGrid(ctx, size, gridCount) {
  ctx.save();
  ctx.strokeStyle = 'rgba(107, 114, 128, 0.18)';
  ctx.lineWidth = 1;
  const count = Math.max(4, Math.min(64, Math.round(gridCount || 8)));
  const step = size / count;
  for (let i = 1; i < count; i++) {
    const position = i * step;
    ctx.beginPath();
    ctx.moveTo(position, 0);
    ctx.lineTo(position, size);
    ctx.moveTo(0, position);
    ctx.lineTo(size, position);
    ctx.stroke();
  }
  ctx.restore();
}

function visibleGridCount(fillGridSize) {
  const value = clampGridSize(fillGridSize);
  if (value <= 64) return value;
  return 64;
}

function drawSignaturePoints(ctx, points, toCanvas, size) {
  ctx.save();
  ctx.fillStyle = 'rgba(220, 38, 38, 0.42)';
  const radius = Math.max(0.9, size / 260);
  const stride = Math.max(1, Math.floor(points.length / 220));
  for (let index = 0; index < points.length; index += stride) {
    const point = toCanvas(points[index]);
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawBreakMarkers(ctx, points, toCanvas, size) {
  ctx.save();
  ctx.fillStyle = '#7c3aed';
  const markerSize = Math.max(5, size / 60);
  for (const point of points || []) {
    if (!point.breakBefore) continue;
    const canvasPoint = toCanvas(point);
    ctx.fillRect(canvasPoint.x - markerSize / 2, canvasPoint.y - markerSize / 2, markerSize, markerSize);
  }
  ctx.restore();
}

function drawCaption(ctx, size, profile, fingerprint) {
  ctx.save();
  const summary = fingerprint?.summary || {};
  const gridSize = fingerprint?.pipelineSettings?.fillGridSize || summary.fillGridSize || '?';
  const segment = summary.sampleMaxSegmentLength ? ` · pas ${summary.sampleMaxSegmentLength} mm` : '';
  const contours = summary.contourCount ? ` · ${summary.contourCount} contours` : '';
  const mode = summary.pipelineMode ? ` · ${summary.pipelineMode}` : '';
  const text = `${profile?.reference || ''} · ${summary.huSource || 'signature'}${mode} · grille ${gridSize} · remplissage ${Math.round((summary.fillRatio || 0) * 1000) / 10}%${segment}${contours}`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.fillRect(0, size - 30, size, 30);
  ctx.fillStyle = '#111827';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText(text, 10, size - 11);
  ctx.restore();
}

function drawMessage(ctx, size, message) {
  ctx.save();
  ctx.fillStyle = '#6b7280';
  ctx.font = '14px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(message, size / 2, size / 2);
  ctx.restore();
}

function splitContours(points) {
  const contours = [];
  let current = [];
  for (const point of points || []) {
    if (point.breakBefore && current.length) {
      contours.push(current);
      current = [];
    }
    current.push(point);
  }
  if (current.length) contours.push(current);
  return contours;
}

function isClosedContour(points) {
  if (points.length < 3) return false;
  const first = points[0];
  const last = points[points.length - 1];
  return distance(first, last) < 0.01;
}

function isDrawableContour(points) {
  if (points.length < 3) return false;
  const jumpLimit = estimateJumpLimit(points);
  const jumps = countLongJumps(points, jumpLimit);
  return jumps <= Math.max(1, Math.round(points.length * 0.03));
}

function countLongJumps(points, jumpLimit) {
  let count = 0;
  for (let index = 1; index < points.length; index++) {
    if (distance(points[index - 1], points[index]) > jumpLimit) count++;
  }
  return count;
}

function estimateJumpLimit(points) {
  if (!points || points.length < 3) return 0.08;
  const distances = [];
  for (let index = 1; index < points.length; index++) {
    const value = distance(points[index - 1], points[index]);
    if (value > 0) distances.push(value);
  }
  distances.sort((a, b) => a - b);
  const median = distances[Math.floor(distances.length / 2)] || 0.01;
  return Math.max(0.035, median * 8);
}

function distance(a, b) {
  return Math.hypot((a?.x || 0) - (b?.x || 0), (a?.y || 0) - (b?.y || 0));
}

function isPointInsideContours(x, y, contours) {
  let inside = false;
  for (const contour of contours) {
    if (isPointInsidePolygon(x, y, contour)) inside = !inside;
  }
  return inside;
}

function isPointInsidePolygon(x, y, points) {
  let inside = false;
  for (let index = 0, previousIndex = points.length - 1; index < points.length; previousIndex = index++) {
    const point = points[index];
    const previous = points[previousIndex];
    const crosses = (point.y > y) !== (previous.y > y);
    if (crosses) {
      const atX = ((previous.x - point.x) * (y - point.y)) / ((previous.y - point.y) || 1e-12) + point.x;
      if (x < atX) inside = !inside;
    }
  }
  return inside;
}

function clampGridSize(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 96;
  return Math.max(8, Math.min(256, Math.round(number)));
}
