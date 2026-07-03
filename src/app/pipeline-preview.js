export function renderPipelinePreview(canvas, profile, fingerprint) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const size = Math.min(canvas.width || 360, canvas.height || 360);
  canvas.width = size;
  canvas.height = size;

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#f9fafb';
  ctx.fillRect(0, 0, size, size);
  drawGrid(ctx, size);

  const points = fingerprint?.descriptors?.points || fingerprint?.contour?.normalizedPoints || [];
  if (!points.length) {
    drawMessage(ctx, size, 'Aucun point signature');
    return;
  }

  const scale = size * 0.82;
  const toCanvas = point => ({
    x: size / 2 + point.x * scale,
    y: size / 2 - point.y * scale
  });

  ctx.save();
  ctx.beginPath();
  points.forEach((point, index) => {
    const canvasPoint = toCanvas(point);
    if (index === 0) ctx.moveTo(canvasPoint.x, canvasPoint.y);
    else ctx.lineTo(canvasPoint.x, canvasPoint.y);
  });
  ctx.closePath();
  ctx.fillStyle = 'rgba(17, 24, 39, 0.16)';
  ctx.fill();
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = Math.max(1.5, size / 180);
  ctx.stroke();
  ctx.restore();

  drawPoints(ctx, points, toCanvas, size);
  drawCaption(ctx, size, profile, fingerprint);
}

function drawGrid(ctx, size) {
  ctx.save();
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 1;
  const step = size / 8;
  for (let i = 1; i < 8; i++) {
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

function drawPoints(ctx, points, toCanvas, size) {
  ctx.save();
  ctx.fillStyle = '#dc2626';
  const radius = Math.max(1.5, size / 140);
  const stride = Math.max(1, Math.floor(points.length / 160));
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
  const text = `${profile?.reference || ''} · ${summary.huSource || 'signature'} · remplissage ${Math.round((summary.fillRatio || 0) * 1000) / 10}%`;
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
