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

  const items = result.items || [];
  const closedCount = (result.debug?.contours || []).filter(contour => contour.closed).length;
  document.querySelector('#detectedCount').textContent = `Profils detectes : ${items.length} · formes fermees : ${closedCount}`;
  const list = document.querySelector('#resultList');
  list.innerHTML = '';
  for (const item of items) {
    const li = document.createElement('li');
    li.innerHTML = renderItem(item);
    list.appendChild(li);
  }
}

function renderItem(item) {
  return `<strong>${item.reference}</strong><br>${item.designation}<br>${Math.round(item.score)} %${formatScoreDetails(item.scoreDetails)}${formatTopCandidates(item.topCandidates)}`;
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
  for (const contour of contours) {
    ctx.strokeStyle = contour.closed ? '#22c55e' : '#f97316';
    ctx.fillStyle = ctx.strokeStyle;
    drawPolyline(ctx, contour.points || [], Boolean(contour.closed));
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
  const jumpLimit = estimateJumpLimit(points);
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1];
    const point = points[i];
    if (distance(previous, point) > jumpLimit) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  }

  if (closed && distance(points[0], points[points.length - 1]) <= jumpLimit) ctx.closePath();
  ctx.stroke();
}

function estimateJumpLimit(points) {
  if (points.length < 3) return 16;
  const distances = [];
  for (let i = 1; i < points.length; i++) {
    const value = distance(points[i - 1], points[i]);
    if (value > 0) distances.push(value);
  }
  distances.sort((a, b) => a - b);
  const median = distances[Math.floor(distances.length / 2)] || 4;
  return Math.max(12, median * 8);
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function formatTopCandidates(candidates) {
  if (!Array.isArray(candidates) || candidates.length <= 1) return '';
  const rows = candidates.slice(0, 10).map((candidate, index) => {
    const details = candidate.scoreDetails?.subscores || {};
    return `<tr><td>${index + 1}</td><td>${candidate.reference}</td><td>${Math.round(candidate.score)}%</td><td>R ${details.ratio ?? '-'} · Hu ${details.hu ?? '-'} · F ${details.fourier ?? '-'}</td></tr>`;
  }).join('');
  return `<details class="score-details"><summary>Top candidats</summary><table><tbody>${rows}</tbody></table></details>`;
}

function formatScoreDetails(details) {
  const scores = details?.subscores;
  if (!scores) return '';
  return `<div class="score-details">${scoreBar('Ratio', scores.ratio)}${scoreBar('Radial', scores.radial)}${scoreBar('Hu', scores.hu)}${scoreBar('Fourier', scores.fourier)}${scoreBar('Angles', scores.angle)}${scoreBar('Remplissage', scores.fill)}</div>`;
}

function scoreBar(label, value) {
  const safe = Math.max(0, Math.min(100, Number(value) || 0));
  return `<div class="score-bar"><span>${label}</span><meter min="0" max="100" value="${safe}"></meter><strong>${safe}%</strong></div>`;
}
