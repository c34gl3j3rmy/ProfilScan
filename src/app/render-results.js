export function renderResults(result) {
  const canvas = document.querySelector('#resultCanvas');
  const ctx = canvas.getContext('2d');
  canvas.width = result.width;
  canvas.height = result.height;

  if (result.preview) {
    const brightness = result.settings?.image?.brightness ?? 0;
    const contrast = result.settings?.image?.contrast ?? 100;
    ctx.filter = `brightness(${100 + brightness}%) contrast(${contrast}%)`;
    ctx.drawImage(result.preview, 0, 0);
    ctx.filter = 'none';
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  drawEdgeOverlay(ctx, result.debug?.edges || []);
  drawTrackedContours(ctx, result.debug?.contours || []);
  drawDetectedItems(ctx, result.items || []);

  document.querySelector('#detectedCount').textContent = `Profils detectes : ${result.items.length}`;
  const list = document.querySelector('#resultList');
  list.innerHTML = '';
  for (const item of result.items) {
    const li = document.createElement('li');
    li.innerHTML = `<strong>${item.reference}</strong><br>${item.designation}<br>${Math.round(item.score)} %${formatScoreDetails(item.scoreDetails)}`;
    list.appendChild(li);
  }
}

function drawEdgeOverlay(ctx, edges) {
  if (!edges.length) return;
  ctx.save();
  ctx.globalAlpha = 0.75;
  ctx.fillStyle = '#ef4444';
  const size = Math.max(1, Math.round(ctx.canvas.width / 900));
  for (const point of edges) ctx.fillRect(point.x, point.y, size, size);
  ctx.restore();
}

function drawTrackedContours(ctx, contours) {
  ctx.save();
  ctx.lineWidth = Math.max(2, ctx.canvas.width / 420);
  ctx.strokeStyle = '#22c55e';
  ctx.fillStyle = '#22c55e';
  for (const contour of contours) {
    drawPolyline(ctx, contour.points || [], true);
  }
  ctx.restore();
}

function drawDetectedItems(ctx, items) {
  ctx.save();
  ctx.lineWidth = Math.max(2, ctx.canvas.width / 300);
  ctx.strokeStyle = '#22c55e';
  ctx.fillStyle = '#22c55e';
  ctx.font = `${Math.max(14, ctx.canvas.width / 35)}px system-ui`;

  for (const item of items) {
    const { x, y, width, height } = item.boundingBox;
    ctx.strokeRect(x, y, width, height);
    ctx.fillText(`${item.reference} - ${Math.round(item.score)}%`, x, Math.max(20, y - 8));
  }
  ctx.restore();
}

function drawPolyline(ctx, points, closed) {
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  if (closed) ctx.closePath();
  ctx.stroke();
}

function formatScoreDetails(details) {
  const scores = details?.subscores;
  if (!scores) return '';
  return `<div class="score-details">Ratio ${scores.ratio}% · Radial ${scores.radial}% · Hu ${scores.hu}% · Fourier ${scores.fourier}%</div>`;
}
