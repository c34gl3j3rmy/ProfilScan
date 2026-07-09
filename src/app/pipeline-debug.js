let lastResult = null;
let panelOpen = false;

const button = document.querySelector('#debugPipelineButton');
const panel = document.querySelector('#debugPipelinePanel');
const summary = document.querySelector('#debugPipelineSummary');
const stages = document.querySelector('#debugPipelineStages');

window.addEventListener('profilscan:result-rendered', event => {
  lastResult = event.detail?.result || window.__profilScanLastResult || null;
  if (panelOpen) renderDebugPipeline(lastResult);
});

button?.addEventListener('click', () => {
  panelOpen = !panelOpen;
  panel?.classList.toggle('hidden', !panelOpen);
  button.textContent = panelOpen ? 'Masquer debug' : 'Debug pipeline';
  if (panelOpen) renderDebugPipeline(lastResult || window.__ProfilScanLastResult || window.__profilScanLastResult || null);
});

export function renderDebugPipeline(result) {
  if (!summary || !stages) return;
  const debug = result?.debugPipeline || result?.debug?.debugPipeline || null;
  if (!debug) {
    summary.innerHTML = '<div class="debug-empty">Aucun debugPipeline disponible. Lance une analyse puis rouvre ce panneau.</div>';
    stages.innerHTML = '';
    return;
  }

  summary.innerHTML = renderSummary(debug, result);
  stages.innerHTML = '';

  for (const stage of buildStages(debug)) {
    stages.appendChild(renderStage(stage, debug));
  }
}

function renderSummary(debug, result) {
  const source = debug.source || {};
  const contours = debug.contours || {};
  const components = debug.components || {};
  const candidates = debug.candidates || {};
  const longJumps = Array.isArray(contours.longJumps) ? contours.longJumps.length : 0;
  const holes = (contours.previews || []).reduce((sum, contour) => sum + (contour.holes?.length || 0), 0);

  return [
    summaryCard('Image', `${source.width || result?.width || '-'} x ${source.height || result?.height || '-'}`, `scale ${formatNumber(source.scale)}`),
    summaryCard('Contours', contours.count ?? '-', `${longJumps} saut(s) long(s)`),
    summaryCard('Composants', components.count ?? '-', `${holes} trou(s) visible(s)`),
    summaryCard('Candidats', candidates.count ?? result?.items?.length ?? '-', 'apres filtrage')
  ].join('');
}

function summaryCard(label, value, hint) {
  return `<div class="debug-summary-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(hint || '')}</small></div>`;
}

function buildStages(debug) {
  return [
    {
      title: '1. Segmentation',
      description: 'Points rouges avant liaison des contours.',
      points: debug.segmentation?.edgePreview || [],
      metrics: {
        mode: debug.segmentation?.mode,
        sampledEdgePoints: debug.segmentation?.sampledEdgePoints,
        threshold: debug.segmentation?.stats?.threshold,
        activePixels: debug.segmentation?.stats?.activePixels
      }
    },
    {
      title: '2. Contours ordonnes',
      description: 'Contours issus du traceur. Orange = contour ouvert. Rouge = contour ferme. Violet = saut long detecte.',
      contours: debug.contours?.previews || [],
      longJumps: debug.contours?.longJumps || [],
      metrics: {
        count: debug.contours?.count,
        longJumps: debug.contours?.longJumps?.length || 0
      }
    },
    {
      title: '3. Reechantillonnage / points normalises',
      description: 'Points utilises par la signature detectee apres normalisation.',
      normalizedPoints: debug.resampling?.points || [],
      metrics: {
        pointCount: debug.resampling?.pointCount,
        descriptorSizes: debug.normalization?.descriptorSizes ? 'present' : 'absent'
      }
    },
    {
      title: '4. Signature radiale',
      description: 'Resume graphique des valeurs radiales.',
      values: debug.radial?.values || [],
      metrics: { values: debug.radial?.values?.length || 0 }
    },
    {
      title: '5. Fourier',
      description: 'Resume graphique des descripteurs de Fourier.',
      values: debug.fourier?.values || [],
      metrics: { values: debug.fourier?.values?.length || 0 }
    },
    {
      title: '6. Matching',
      description: 'Premiers candidats remontes par le moteur de comparaison.',
      matching: debug.matching || {},
      metrics: { detectedItems: debug.matching?.count || 0 }
    }
  ];
}

function renderStage(stage, debug) {
  const root = document.createElement('section');
  root.className = 'debug-stage-card';

  root.innerHTML = `
    <header>
      <div>
        <h4>${escapeHtml(stage.title)}</h4>
        <p>${escapeHtml(stage.description)}</p>
      </div>
      <details>
        <summary>Mesures</summary>
        <pre>${escapeHtml(JSON.stringify(stage.metrics || {}, null, 2))}</pre>
      </details>
    </header>
  `;

  if (stage.points) root.appendChild(renderPointCanvas(stage.points, debug, 'points'));
  if (stage.contours) root.appendChild(renderContourCanvas(stage.contours, stage.longJumps || [], debug));
  if (stage.normalizedPoints) root.appendChild(renderPointCanvas(stage.normalizedPoints, debug, 'normalized'));
  if (stage.values) root.appendChild(renderValues(stage.values));
  if (stage.matching) root.appendChild(renderMatching(stage.matching));

  return root;
}

function renderPointCanvas(points, debug, mode) {
  const canvas = document.createElement('canvas');
  canvas.className = 'debug-stage-canvas';
  const size = mode === 'normalized' ? 360 : 520;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  drawCanvasBackground(ctx);

  if (mode === 'normalized') drawNormalizedPoints(ctx, points);
  else drawImagePoints(ctx, points, debug);

  return canvas;
}

function renderContourCanvas(contours, longJumps, debug) {
  const canvas = document.createElement('canvas');
  canvas.className = 'debug-stage-canvas';
  canvas.width = 520;
  canvas.height = 520;
  const ctx = canvas.getContext('2d');
  drawCanvasBackground(ctx);

  const bounds = getImageBounds(debug);
  const transform = makeImageTransform(bounds, canvas.width, canvas.height);

  contours.forEach((contour, index) => {
    drawPolyline(ctx, contour.points || [], transform, contour.closed ? '#dc2626' : '#f97316', Boolean(contour.closed));
    for (const hole of contour.holes || []) drawPolyline(ctx, hole.points || [], transform, '#06b6d4', Boolean(hole.closed));
    drawLabel(ctx, transform(bounds.x + 6, bounds.y + 18 + index * 18), `#${index + 1} ${contour.closed ? 'ferme' : 'ouvert'}`);
  });

  for (const jump of longJumps || []) drawJump(ctx, jump, transform);

  return canvas;
}

function renderValues(values) {
  const canvas = document.createElement('canvas');
  canvas.className = 'debug-stage-canvas debug-bar-canvas';
  canvas.width = 520;
  canvas.height = 220;
  const ctx = canvas.getContext('2d');
  drawCanvasBackground(ctx);

  const numeric = values.map(Number).filter(Number.isFinite);
  const max = Math.max(...numeric.map(Math.abs), 1);
  const gap = 2;
  const width = Math.max(2, (canvas.width - 32) / Math.max(1, numeric.length) - gap);
  const zeroY = canvas.height - 24;

  ctx.save();
  ctx.strokeStyle = '#d1d5db';
  ctx.beginPath();
  ctx.moveTo(16, zeroY);
  ctx.lineTo(canvas.width - 16, zeroY);
  ctx.stroke();
  ctx.fillStyle = '#111827';
  numeric.forEach((value, index) => {
    const height = Math.max(1, Math.abs(value / max) * (canvas.height - 56));
    const x = 16 + index * (width + gap);
    const y = zeroY - height;
    ctx.fillRect(x, y, width, height);
  });
  ctx.restore();
  return canvas;
}

function renderMatching(matching) {
  const box = document.createElement('div');
  box.className = 'debug-matching-list';
  const rows = (matching.topItems || []).map((item, index) => {
    const candidates = (item.topCandidates || []).map(candidate => `${candidate.reference} (${formatNumber(candidate.score)}%)`).join(' · ');
    return `<li><strong>${index + 1}. ${escapeHtml(item.reference || '-')} - ${formatNumber(item.score)}%</strong><span>${escapeHtml(candidates || 'Aucun candidat')}</span></li>`;
  }).join('');
  box.innerHTML = rows ? `<ol>${rows}</ol>` : '<p class="hint">Aucun matching disponible.</p>';
  return box;
}

function drawCanvasBackground(ctx) {
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.strokeStyle = '#e5e7eb';
  ctx.strokeRect(0.5, 0.5, ctx.canvas.width - 1, ctx.canvas.height - 1);
  ctx.restore();
}

function drawImagePoints(ctx, points, debug) {
  const bounds = getImageBounds(debug);
  const transform = makeImageTransform(bounds, ctx.canvas.width, ctx.canvas.height);
  ctx.save();
  ctx.fillStyle = '#dc2626';
  for (const point of points || []) {
    const p = transform(point.x, point.y);
    ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
  }
  ctx.restore();
}

function drawNormalizedPoints(ctx, points) {
  const transform = (x, y) => ({
    x: ctx.canvas.width / 2 + x * ctx.canvas.width * 0.82,
    y: ctx.canvas.height / 2 + y * ctx.canvas.height * 0.82
  });
  ctx.save();
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 2;
  ctx.beginPath();
  let started = false;
  for (const point of points || []) {
    const p = transform(Number(point.x) || 0, Number(point.y) || 0);
    if (!started || point.breakBefore) {
      ctx.moveTo(p.x, p.y);
      started = true;
    } else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
  ctx.fillStyle = '#2563eb';
  for (const point of points || []) {
    const p = transform(Number(point.x) || 0, Number(point.y) || 0);
    ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
  }
  ctx.restore();
}

function drawPolyline(ctx, points, transform, color, closed) {
  if (!points?.length) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  let started = false;
  for (const point of points) {
    const p = transform(point.x, point.y);
    if (!started || point.breakBefore) {
      ctx.moveTo(p.x, p.y);
      started = true;
    } else ctx.lineTo(p.x, p.y);
  }
  if (closed) ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawJump(ctx, jump, transform) {
  const from = jump.from || {};
  const to = jump.to || {};
  const a = transform(from.x, from.y);
  const b = transform(to.x, to.y);
  ctx.save();
  ctx.strokeStyle = '#7c3aed';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.fillStyle = '#7c3aed';
  ctx.fillRect(a.x - 3, a.y - 3, 6, 6);
  ctx.fillRect(b.x - 3, b.y - 3, 6, 6);
  ctx.restore();
}

function drawLabel(ctx, point, text) {
  ctx.save();
  ctx.font = '12px system-ui';
  ctx.fillStyle = '#111827';
  ctx.fillText(text, point.x, point.y);
  ctx.restore();
}

function getImageBounds(debug) {
  const source = debug?.source || {};
  const width = source.width || source.scaledWidth || 1;
  const height = source.height || source.scaledHeight || 1;
  return { x: 0, y: 0, width, height };
}

function makeImageTransform(bounds, canvasWidth, canvasHeight) {
  const padding = 16;
  const scale = Math.min((canvasWidth - padding * 2) / bounds.width, (canvasHeight - padding * 2) / bounds.height) || 1;
  const offsetX = (canvasWidth - bounds.width * scale) / 2;
  const offsetY = (canvasHeight - bounds.height * scale) / 2;
  return (x, y) => ({ x: offsetX + (x - bounds.x) * scale, y: offsetY + (y - bounds.y) * scale });
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  return Math.round(number * 100) / 100;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
