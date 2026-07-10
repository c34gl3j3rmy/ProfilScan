export function renderPipelinePreview(canvas, profile, fingerprint) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const size = Math.min(canvas.width || 360, canvas.height || 360);
  canvas.width = size;
  canvas.height = size;

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#f9fafb';
  ctx.fillRect(0, 0, size, size);

  const contours = getPreviewContours(fingerprint);
  const signaturePoints = fingerprint?.descriptors?.points || [];

  if (!contours.length) {
    drawGrid(ctx, size, 8);
    drawMessage(ctx, size, 'Empreinte invalide : contours absents');
    return;
  }

  const scale = size * 0.82;
  const toCanvas = point => ({
    x: size / 2 + point.x * scale,
    y: size / 2 + point.y * scale
  });

  const gridSize = fingerprint?.pipelineSettings?.fillGridSize || fingerprint?.summary?.fillGridSize || 96;
  drawMaterialGrid(ctx, size, contours, gridSize);
  drawGrid(ctx, size, visibleGridCount(gridSize));
  drawContours(ctx, contours, toCanvas, size);
  drawSignaturePoints(ctx, signaturePoints, toCanvas, size);
  drawCaption(ctx, size, profile, fingerprint);
}

function getPreviewContours(fingerprint) {
  return (fingerprint?.contour?.contours || [])
    .map(contour => ({
      closed: contour?.closed !== false,
      points: Array.isArray(contour?.points) ? contour.points : []
    }))
    .filter(contour => contour.points.length >= 3);
}

function drawMaterialGrid(ctx, size, contours, gridSize) {
  const normalizedGridSize = clampGridSize(gridSize);
  const validContours = contours.filter(contour => contour.points.length >= 3);
  const cellSize = size / normalizedGridSize;
  const step = 1 / normalizedGridSize;
  const start = -0.5 + step / 2;

  ctx.save();
  ctx.fillStyle = 'rgba(37, 99, 235, 0.18)';

  for (let yIndex = 0; yIndex < normalizedGridSize; yIndex++) {
    const y = start + yIndex * step;
    for (let xIndex = 0; xIndex < normalizedGridSize; xIndex++) {
      const x = start + xIndex * step;
      if (!isPointInsideContoursEvenOdd(x, y, validContours)) continue;
      ctx.fillRect(
        xIndex * cellSize,
        yIndex * cellSize,
        Math.max(0.8, cellSize),
        Math.max(0.8, cellSize)
      );
    }
  }

  ctx.restore();
}

function drawContours(ctx, contours, toCanvas, size) {
  ctx.save();
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = Math.max(1.5, size / 180);

  for (const contour of contours) {
    const points = contour.points || [];
    if (points.length < 2) continue;

    ctx.beginPath();
    const first = toCanvas(points[0]);
    ctx.moveTo(first.x, first.y);

    for (let index = 1; index < points.length; index++) {
      const point = toCanvas(points[index]);
      ctx.lineTo(point.x, point.y);
    }

    if (contour.closed !== false) ctx.closePath();
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
  return value <= 64 ? value : 64;
}

function drawSignaturePoints(ctx, points, toCanvas, size) {
  if (!Array.isArray(points) || !points.length) return;

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

function isPointInsideContoursEvenOdd(x, y, contours) {
  let inside = false;
  for (const contour of contours) {
    if (isPointInsidePolygon(x, y, contour.points)) inside = !inside;
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
