export function renderResults(result) {
  const canvas = document.querySelector('#resultCanvas');
  canvas.style.filter = 'none';
  const ctx = canvas.getContext('2d');
  canvas.width = result.width;
  canvas.height = result.height;

  if (result.preview) {
    const brightness = result.settings?.image?.brightness ?? 0;
    const contrast = result.settings?.image?.contrast ?? 100;
    ctx.filter = `brightness(${Math.max(0, 100 + brightness)}%) contrast(${Math.max(0, contrast)}%)`;
    ctx.drawImage(result.preview, 0, 0);
    ctx.filter = 'none';
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  drawFocusPeakingOverlay(ctx, result.debug?.edges || []);
  drawTrackedContours(ctx, result.debug?.contours || []);
  drawDetectedItems(ctx, result.items || []);

  const items = result.items || [];
  const contours = result.debug?.contours || [];
  const closedCount = contours.filter(contour => contour.closed).length;
  const holeCount = contours.reduce((sum, contour) => sum + (contour.holes?.length || 0), 0);
  document.querySelector('#detectedCount').textContent = `Profils detectes : ${items.length} · formes fermees : ${closedCount} · trous : ${holeCount}`;
  const list = document.querySelector('#resultList');
  list.innerHTML = '';
  for (const item of items) {
    const li = document.createElement('li');
    li.innerHTML = renderItem(item);
    list.appendChild(li);
  }
  renderAdvice(result, items, contours, closedCount);
}

function renderItem(item) {
  return `<strong>${item.reference}</strong><br>${item.designation}<br>${Math.round(item.score)} %${formatUncertainty(item.topCandidates)}${formatScoreDetails(item.scoreDetails)}${formatTopCandidates(item.topCandidates)}`;
}

function renderAdvice(result, items, contours, closedCount) {
  const panel = document.querySelector('#analysisAdvice');
  if (!panel) return;

  const edges = result.debug?.edges || [];
  const edgeDensity = edges.length / Math.max(1, result.width * result.height);
  const openCount = Math.max(0, contours.length - closedCount);
  const suggestions = [];
  const uncertainCount = items.filter(item => hasCloseCandidates(item.topCandidates)).length;

  if (!items.length && !closedCount) {
    suggestions.push(['Aucun profil detecte', 'Baisse legerement le seuil contour, augmente le contraste, puis augmente Connexion contours si les traits restent coupes.', 'danger']);
  }
  if (edgeDensity > 0.045) {
    suggestions.push(['Trop de bruit', 'Augmente Seuil contour ou Aire mini pour supprimer les petits points rouges parasites.', 'warning']);
  }
  if (edgeDensity < 0.006) {
    suggestions.push(['Pas assez de contours', 'Diminue Seuil contour ou augmente le contraste pour faire ressortir le profil.', 'warning']);
  }
  if (openCount > closedCount) {
    suggestions.push(['Contours non fermes', 'Augmente Connexion contours ou Fusion objets pour relier les segments du meme profil.', 'info']);
  }
  if (items.length > 3) {
    suggestions.push(['Trop d objets detectes', 'Augmente Aire mini ou Fusion objets pour eviter les morceaux parasites.', 'warning']);
  }
  if (uncertainCount) {
    suggestions.push(['Reconnaissance incertaine', `${uncertainCount} profil(s) ont plusieurs candidats tres proches. Controle le Top candidats avant validation.`, 'warning']);
  }
  if (!suggestions.length) {
    suggestions.push(['Segmentation exploitable', 'Tu peux maintenant ajuster les poids de matching ou indiquer le profil attendu pour comparer les scores.', 'ok']);
  }

  const settings = result.settings;
  panel.innerHTML = `
    <h3>Informations & conseils</h3>
    <div class="advice-status ${items.length ? 'ok' : 'danger'}">
      <strong>${items.length ? 'Analyse exploitable' : 'Detection insuffisante'}</strong>
      <span>${items.length} profil(s) detecte(s), ${closedCount} forme(s) fermee(s), ${openCount} contour(s) ouvert(s)</span>
    </div>
    ${suggestions.map(([title, text, type]) => `<div class="advice-card ${type}"><strong>${title}</strong><span>${text}</span></div>`).join('')}
    <details class="score-details"><summary>Valeurs de reglages actuelles</summary>
      <table><tbody>
        <tr><td>Luminosite</td><td>${settings?.image?.brightness ?? '-'}</td></tr>
        <tr><td>Contraste</td><td>${settings?.image?.contrast ?? '-'}%</td></tr>
        <tr><td>Seuil contour</td><td>${Math.round((settings?.detection?.edgeQuantile ?? 0) * 100)}%</td></tr>
        <tr><td>Connexion contours</td><td>${settings?.detection?.linkRadius ?? '-'} px</td></tr>
        <tr><td>Aire mini</td><td>${formatPercent(settings?.detection?.minAreaRatio)}</td></tr>
        <tr><td>Fusion objets</td><td>${formatPercent(settings?.detection?.mergeGapRatio)}</td></tr>
        <tr><td>Densite points rouges</td><td>${formatPercent(edgeDensity)}</td></tr>
      </tbody></table>
    </details>`;
}

function drawFocusPeakingOverlay(ctx, edges) {
  if (!edges.length) return;
  ctx.save();
  const size = Math.max(2, Math.round(ctx.canvas.width / 520));
  const haloSize = Math.max(size + 2, Math.round(ctx.canvas.width / 320));

  ctx.globalAlpha = 0.38;
  ctx.fillStyle = '#ffffff';
  for (const point of edges) ctx.fillRect(point.x - haloSize / 2, point.y - haloSize / 2, haloSize, haloSize);

  ctx.globalAlpha = 1;
  ctx.shadowColor = '#ffffff';
  ctx.shadowBlur = Math.max(2, size);
  ctx.fillStyle = '#ff1111';
  for (const point of edges) ctx.fillRect(point.x - size / 2, point.y - size / 2, size, size);
  ctx.restore();
}

function drawTrackedContours(ctx, contours) {
  ctx.save();
  ctx.lineWidth = Math.max(3, ctx.canvas.width / 300);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.shadowColor = '#ffffff';
  ctx.shadowBlur = Math.max(2, ctx.canvas.width / 420);

  for (const contour of contours) {
    ctx.strokeStyle = contour.closed ? '#ff1111' : '#ff7a00';
    ctx.fillStyle = ctx.strokeStyle;
    drawPolyline(ctx, contour.points || [], Boolean(contour.closed));
    drawHoleContours(ctx, contour.holes || []);
  }
  ctx.restore();
}

function drawHoleContours(ctx, holes) {
  if (!holes.length) return;
  ctx.save();
  ctx.lineWidth = Math.max(2, ctx.canvas.width / 480);
  ctx.strokeStyle = '#00d5ff';
  ctx.fillStyle = '#00d5ff';
  ctx.shadowColor = '#ffffff';
  ctx.shadowBlur = Math.max(2, ctx.canvas.width / 500);
  for (const hole of holes) {
    drawPolyline(ctx, hole.points || [], Boolean(hole.closed));
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

function formatUncertainty(candidates) {
  const close = getCloseCandidates(candidates);
  if (!close) return '';

  return `<div class="uncertainty-card">
    <strong>Resultat incertain</strong>
    <span>${close.first.reference} et ${close.second.reference} sont separes de seulement ${close.gap.toFixed(2)} point(s).</span>
    <small>Controle le Top candidats avant validation.</small>
  </div>`;
}

function hasCloseCandidates(candidates) {
  return Boolean(getCloseCandidates(candidates));
}

function getCloseCandidates(candidates) {
  if (!Array.isArray(candidates) || candidates.length < 2) return null;
  const [first, second] = candidates;
  const firstScore = Number(first?.score);
  const secondScore = Number(second?.score);
  if (!Number.isFinite(firstScore) || !Number.isFinite(secondScore)) return null;

  const gap = Math.abs(firstScore - secondScore);
  if (firstScore < 75 || secondScore < 75 || gap > 1.5) return null;
  return { first, second, gap };
}

function formatTopCandidates(candidates) {
  if (!Array.isArray(candidates) || candidates.length <= 1) return '';
  const rows = candidates.slice(0, 10).map((candidate, index) => {
    const details = candidate.scoreDetails?.subscores || {};
    const closeClass = index < 2 && hasCloseCandidates(candidates) ? ' class="close-candidate"' : '';
    return `<tr${closeClass}><td>${index + 1}</td><td>${candidate.reference}</td><td>${formatScoreValue(candidate.score)}</td><td>R ${details.ratio ?? '-'} · Hu ${details.hu ?? '-'} · F ${details.fourier ?? '-'}</td></tr>`;
  }).join('');
  return `<details class="score-details"><summary>Top candidats</summary><table><tbody>${rows}</tbody></table></details>`;
}

function formatScoreDetails(details) {
  const scores = details?.subscores;
  if (!scores) return '';
  return `<div class="score-details">${scoreBar('Ratio', scores.ratio)}${scoreBar('Radial', scores.radial)}${scoreBar('Hu', scores.hu)}${scoreBar('Fourier', scores.fourier)}${scoreBar('Angles', scores.angle)}${scoreBar('Remplissage', scores.fill)}${scoreBar('Avance', scores.advanced)}</div>`;
}

function scoreBar(label, value) {
  const safe = Math.max(0, Math.min(100, Number(value) || 0));
  return `<div class="score-bar"><span>${label}</span><meter min="0" max="100" value="${safe}"></meter><strong>${safe}%</strong></div>`;
}

function formatScoreValue(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return '-';
  return `${score.toFixed(2)}%`;
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return '-';
  return `${(value * 100).toFixed(2)}%`;
}
