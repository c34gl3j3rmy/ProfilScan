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
  if (panelOpen) renderDebugPipeline(lastResult || window.__profilScanLastResult || null);
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
  for (const stage of buildStages(debug)) stages.appendChild(renderStage(stage, debug));
}

function renderSummary(debug, result) {
  const source = debug.source || {};
  const contours = debug.contours || {};
  const components = debug.components || {};
  const candidates = debug.candidates || {};
  const holes = (contours.previews || []).reduce((sum, contour) => sum + (contour.holes?.length || 0), 0);

  return [
    summaryCard('Image', `${source.width || result?.width || '-'} x ${source.height || result?.height || '-'}`, source.inputMode || `scale ${formatNumber(source.scale)}`),
    summaryCard('Contours', contours.count ?? '-', `${holes} trou(s)`),
    summaryCard('Composants', components.count ?? '-', 'avant filtrage'),
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
      description: debug.segmentation?.filledMask
        ? 'Frontiere du masque de matiere noire.'
        : 'Points rouges avant liaison des contours.',
      points: debug.segmentation?.edgePreview || [],
      metrics: {
        mode: debug.segmentation?.mode,
        filledMask: Boolean(debug.segmentation?.filledMask),
        sampledEdgePoints: debug.segmentation?.sampledEdgePoints,
        threshold: debug.segmentation?.stats?.threshold,
        activePixels: debug.segmentation?.stats?.activePixels
      }
    },
    {
      title: '2. Contours ordonnes',
      description: 'Chaque contour et chaque trou sont dessines independamment.',
      contours: debug.contours?.previews || [],
      metrics: { count: debug.contours?.count }
    },
    {
      title: '3. Reechantillonnage / contours normalises',
      description: 'Contours utilises par la signature detectee apres normalisation.',
      normalizedContours: debug.resampling?.contours || [],
      metrics: {
        pointCount: debug.resampling?.pointCount,
        contourCount: debug.resampling?.contours?.length || 0,
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

  if (stage.points) root.appendChild(renderPointCanvas(stage.points, debug));
  if (stage.contours) root.appendChild(renderContourCanvas(stage.contours, debug));
  if (stage.normalizedContours) root.appendChild(renderNormalizedContourCanvas(stage.normalizedContours));
  if (stage.values) root.appendChild(renderValues(stage.values));
  if (stage.matching) root.appendChild(renderMatching(stage.matching));
  return root;
}

function renderPointCanvas(points, debug) {
  const canvas = createCanvas(520, 520);
  const ctx = canvas.getContext('2d');
  drawCanvasBackground(ctx);
  const bounds = getImageBounds(debug);
  const transform = makeImageTransform(bounds, canvas.width, canvas.height);
  ctx.save();
  ctx.fillStyle = '#dc2626';
  for (const point of points || []) {
    const p = transform(point.x, point.y);
    ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
  }
  ctx.restore();
  return canvas;
}

function renderContourCanvas(contours, debug) {
  const canvas = createCanvas(520, 520);
  const ctx = canvas.getContext('2d');
  drawCanvasBackground(ctx);
  const bounds = getImageBounds(debug);
  const transform = makeImageTransform(bounds, canvas.width, canvas.height);

  contours.forEach((entry, index) => {
    const structured = entry.contours?.length
      ? entry.contours
      : [{ points: entry.points || [], closed: entry.closed !== false }];

    for (const contour of structured) {
      drawPolyline(ctx, contour.points || [], transform, contour.closed === false ? '#f97316' : '#dc2626', contour.closed !== false);
    }
    for (const hole of entry.holes || []) {
      const holeContours = hole.contours?.length
        ? hole.contours
        : [{ points: hole.points || [], closed: hole.closed !== false }];
      for (const contour of holeContours) drawPolyline(ctx, contour.points || [], transform, '#06b6d4', contour.closed !== false);
    }
    drawLabel(ctx, transform(bounds.x + 6, bounds.y + 18 + index * 18), `#${index + 1} ${entry.closed ? 'ferme' : 'ouvert'}`);
  });

  return canvas;
}

function renderNormalizedContourCanvas(contours) {
  const canvas = createCanvas(360, 360);
  const ctx = canvas.getContext('2d');
  drawCanvasBackground(ctx);
  const transform = (x, y) => ({
    x: canvas.width / 2 + Number(x || 0) * canvas.width * 0.82,
    y: canvas.height / 2 + Number(y || 0) * canvas.height * 0.82
  });

  for (const contour of contours || []) {
    const points = contour?.points || [];
    if (points.length < 2) continue;
    drawPolyline(ctx, points, transform, '#111827', contour.closed !== false, 2);

    ctx.save();
    ctx.fillStyle = '#2563eb';
    for (const point of points) {
      const p = transform(point.x, point.y);
      ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    }
    ctx.restore();
  }

  return canvas;
}

function renderValues(values) {
  const canvas = createCanvas(520, 220, 'debug-bar-canvas');
  const ctx = canvas.getContext('2d');
  drawCanvasBackground(ctx);
  const numeric = (values || []).map(Number).filter(Number.isFinite);
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
    ctx.fillRect(x, zeroY - height, width, height);
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

function createCanvas(width, height, extraClass = '') {
  const canvas = document.createElement('canvas');
  canvas.className = `debug-stage-canvas${extraClass ? ` ${extraClass}` : ''}`;
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function drawCanvasBackground(ctx) {
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.strokeStyle = '#e5e7eb';
  ctx.strokeRect(0.5, 0.5, ctx.canvas.width - 1, ctx.canvas.height - 1);
  ctx.restore();
}

function drawPolyline(ctx, points, transform, color, closed, lineWidth = 3) {
  if (!points?.length) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  const first = transform(points[0].x, points[0].y);
  ctx.moveTo(first.x, first.y);
  for (let index = 1; index < points.length; index++) {
    const p = transform(points[index].x, points[index].y);
    ctx.lineTo(p.x, p.y);
  }
  if (closed) ctx.closePath();
  ctx.stroke();
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
  return {
    x: 0,
    y: 0,
    width: source.width || source.scaledWidth || 1,
    height: source.height || source.scaledHeight || 1
  };
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
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : '-';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
