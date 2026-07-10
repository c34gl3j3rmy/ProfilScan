import { getCollection } from '../storage/indexed-db.js';
import { buildUnifiedFingerprint } from '../shape-engine/fingerprint-pipeline.js';
import { compareFingerprintsDetailed } from '../shape-engine/candidate-search.js';

const openButton = document.querySelector('#signatureLabButton');
const closeButton = document.querySelector('#closeSignatureLabButton');
const compareButton = document.querySelector('#signatureLabCompareButton');
const exportButton = document.querySelector('#signatureLabExportButton');
const screen = document.querySelector('#screenSignatureLab');
const profileAInput = document.querySelector('#signatureLabProfileA');
const profileBInput = document.querySelector('#signatureLabProfileB');
const status = document.querySelector('#signatureLabStatus');
const summary = document.querySelector('#signatureLabSummary');
const profileAView = document.querySelector('#signatureLabProfileAView');
const profileBView = document.querySelector('#signatureLabProfileBView');
const metricsBody = document.querySelector('#signatureLabMetricsBody');
const charts = {
  radialA: document.querySelector('#signatureLabRadialA'),
  radialB: document.querySelector('#signatureLabRadialB'),
  fourierA: document.querySelector('#signatureLabFourierA'),
  fourierB: document.querySelector('#signatureLabFourierB'),
  angleA: document.querySelector('#signatureLabAngleA'),
  angleB: document.querySelector('#signatureLabAngleB')
};

let collection = null;
let lastReport = null;

openButton?.addEventListener('click', openLab);
closeButton?.addEventListener('click', closeLab);
compareButton?.addEventListener('click', compareSelectedProfiles);
exportButton?.addEventListener('click', exportLastReport);

async function openLab() {
  try {
    collection = collection || await getCollection();
    if (!collection?.profiles?.length) throw new Error('Base profils absente.');
    hideAllScreens();
    screen?.classList.remove('hidden');
    populateDefaults();
    await compareSelectedProfiles();
  } catch (error) {
    setStatus(`Erreur : ${error.message || error}`, true);
  }
}

function closeLab() {
  hideAllScreens();
  document.querySelector('#screenHome')?.classList.remove('hidden');
}

function hideAllScreens() {
  document.querySelectorAll('.app-shell > section').forEach(section => section.classList.add('hidden'));
}

function populateDefaults() {
  if (!collection?.profiles?.length) return;
  if (!profileAInput.value) profileAInput.value = collection.profiles[0]?.reference || '';
  if (!profileBInput.value) profileBInput.value = collection.profiles[1]?.reference || collection.profiles[0]?.reference || '';
}

async function compareSelectedProfiles() {
  if (!collection?.profiles?.length) collection = await getCollection();
  const profileA = findProfile(profileAInput?.value);
  const profileB = findProfile(profileBInput?.value);

  if (!profileA || !profileB) {
    setStatus('Choisis deux références présentes dans la base.', true);
    return;
  }

  setStatus('Calcul des signatures...');
  compareButton.disabled = true;

  try {
    const startA = performance.now();
    const fingerprintA = await buildUnifiedFingerprint({ kind: 'profile', profile: profileA }, collection.pipelineSettings || {});
    const elapsedA = performance.now() - startA;

    const startB = performance.now();
    const fingerprintB = await buildUnifiedFingerprint({ kind: 'profile', profile: profileB }, collection.pipelineSettings || {});
    const elapsedB = performance.now() - startB;

    const comparison = compareFingerprintsDetailed(fingerprintA, fingerprintB);
    lastReport = buildCompactReport(profileA, profileB, fingerprintA, fingerprintB, comparison, elapsedA, elapsedB);

    renderProfile(profileAView, profileA, fingerprintA, elapsedA);
    renderProfile(profileBView, profileB, fingerprintB, elapsedB);
    renderSummary(lastReport);
    renderMetrics(comparison, fingerprintA, fingerprintB);
    drawSeries(charts.radialA, fingerprintA.descriptors?.radial || []);
    drawSeries(charts.radialB, fingerprintB.descriptors?.radial || []);
    drawSeries(charts.fourierA, fingerprintA.descriptors?.fourier || []);
    drawSeries(charts.fourierB, fingerprintB.descriptors?.fourier || []);
    drawSeries(charts.angleA, fingerprintA.descriptors?.angleHistogram || []);
    drawSeries(charts.angleB, fingerprintB.descriptors?.angleHistogram || []);
    setStatus(`Comparaison terminée : score global ${format(comparison.score)} %`);
  } catch (error) {
    setStatus(`Erreur : ${error.message || error}`, true);
  } finally {
    compareButton.disabled = false;
  }
}

function renderProfile(target, profile, fingerprint, elapsedMs) {
  if (!target) return;
  const width = positive(profile.width, fingerprint.summary?.width, 100);
  const height = positive(profile.height, fingerprint.summary?.height, 100);
  const path = String(profile.svgPath || profile.paths || '').trim();
  const svg = path
    ? `<svg viewBox="0 0 ${escapeHtml(width)} ${escapeHtml(height)}" role="img" aria-label="Profil ${escapeHtml(profile.reference)}"><path d="${escapeHtml(path)}" fill="currentColor" fill-rule="evenodd"></path></svg>`
    : '<div class="signature-lab-empty">Chemin SVG indisponible</div>';

  target.innerHTML = `
    <header>
      <strong>${escapeHtml(profile.reference)}</strong>
      <span>${escapeHtml(profile.designation || '')}</span>
    </header>
    <div class="signature-lab-svg">${svg}</div>
    <dl>
      <div><dt>Dimensions</dt><dd>${format(width)} × ${format(height)}</dd></div>
      <div><dt>Contours</dt><dd>${fingerprint.summary?.contourCount ?? '-'}</dd></div>
      <div><dt>Remplissage</dt><dd>${format((fingerprint.summary?.fillRatio || 0) * 100)} %</dd></div>
      <div><dt>Points</dt><dd>${fingerprint.summary?.descriptorPointCount ?? '-'}</dd></div>
      <div><dt>Calcul</dt><dd>${format(elapsedMs)} ms</dd></div>
      <div><dt>Pipeline</dt><dd>${escapeHtml(fingerprint.summary?.pipelineMode || fingerprint.summary?.source || '-')}</dd></div>
    </dl>
  `;
}

function renderSummary(report) {
  if (!summary) return;
  const rows = [
    ['Score global', `${format(report.comparison.score)} %`],
    ['Écart de ratio', format(Math.abs((report.profileA.summary.normalizedRatio || 0) - (report.profileB.summary.normalizedRatio || 0)))],
    ['Contours A / B', `${report.profileA.summary.contourCount ?? '-'} / ${report.profileB.summary.contourCount ?? '-'}`],
    ['Points A / B', `${report.profileA.summary.descriptorPointCount ?? '-'} / ${report.profileB.summary.descriptorPointCount ?? '-'}`],
    ['Temps A / B', `${format(report.profileA.elapsedMs)} / ${format(report.profileB.elapsedMs)} ms`],
    ['Version', report.version]
  ];
  summary.innerHTML = rows.map(([label, value]) => `<div class="debug-summary-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
}

function renderMetrics(comparison, fingerprintA, fingerprintB) {
  if (!metricsBody) return;
  const subscores = comparison?.subscores || {};
  const keys = [
    ['ratio', 'Ratio'],
    ['radial', 'Radiale'],
    ['fourier', 'Fourier'],
    ['angle', 'Angles'],
    ['fill', 'Remplissage'],
    ['minutiae', 'Minuties'],
    ['localFeature', 'Détails locaux'],
    ['globalStage', 'Étape globale'],
    ['localStage', 'Étape locale'],
    ['baseStage', 'Fusion de base']
  ];

  metricsBody.innerHTML = keys.map(([key, label]) => {
    const sizeA = descriptorSize(fingerprintA, key);
    const sizeB = descriptorSize(fingerprintB, key);
    const value = Number(subscores[key]);
    const evaluable = Number.isFinite(value) && (sizeA > 0 || sizeB > 0 || ['ratio', 'fill', 'globalStage', 'localStage', 'baseStage'].includes(key));
    return `<tr>
      <th>${escapeHtml(label)}</th>
      <td>${evaluable ? `${format(value)} %` : 'non évaluable'}</td>
      <td>${sizeA}</td>
      <td>${sizeB}</td>
      <td><span class="signature-lab-state ${evaluable ? 'validated' : 'non-evaluable'}">${evaluable ? 'disponible' : 'non-evaluable'}</span></td>
    </tr>`;
  }).join('');
}

function descriptorSize(fingerprint, key) {
  if (key === 'ratio' || key === 'fill') return 1;
  const aliases = { angle: 'angleHistogram' };
  const value = fingerprint?.descriptors?.[aliases[key] || key];
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') return Object.values(value).reduce((sum, entry) => sum + (Array.isArray(entry) ? entry.length : 1), 0);
  return 0;
}

function drawSeries(canvas, values) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#e5e7eb';
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

  const numeric = (values || []).map(Number).filter(Number.isFinite);
  if (!numeric.length) {
    ctx.fillStyle = '#6b7280';
    ctx.font = '13px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('Signature indisponible', width / 2, height / 2);
    return;
  }

  const min = Math.min(...numeric);
  const max = Math.max(...numeric);
  const span = max - min || 1;
  const padding = 14;
  ctx.beginPath();
  numeric.forEach((value, index) => {
    const x = padding + index * (width - padding * 2) / Math.max(1, numeric.length - 1);
    const y = height - padding - (value - min) / span * (height - padding * 2);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function buildCompactReport(profileA, profileB, fingerprintA, fingerprintB, comparison, elapsedA, elapsedB) {
  return {
    type: 'ProfilScan signature laboratory report',
    version: 'signature-lab-v1',
    createdAt: new Date().toISOString(),
    profileA: summarizeProfile(profileA, fingerprintA, elapsedA),
    profileB: summarizeProfile(profileB, fingerprintB, elapsedB),
    comparison: {
      score: round(comparison.score),
      subscores: compactNumbers(comparison.subscores),
      weights: comparison.weights || {}
    },
    descriptors: {
      radialA: compactArray(fingerprintA.descriptors?.radial),
      radialB: compactArray(fingerprintB.descriptors?.radial),
      fourierA: compactArray(fingerprintA.descriptors?.fourier),
      fourierB: compactArray(fingerprintB.descriptors?.fourier),
      angleA: compactArray(fingerprintA.descriptors?.angleHistogram),
      angleB: compactArray(fingerprintB.descriptors?.angleHistogram)
    }
  };
}

function summarizeProfile(profile, fingerprint, elapsedMs) {
  return {
    reference: profile.reference,
    designation: profile.designation || '',
    elapsedMs: round(elapsedMs),
    summary: compactNumbers(fingerprint.summary),
    descriptorSizes: {
      radial: fingerprint.descriptors?.radial?.length || 0,
      fourier: fingerprint.descriptors?.fourier?.length || 0,
      angleHistogram: fingerprint.descriptors?.angleHistogram?.length || 0,
      hu: fingerprint.descriptors?.hu?.length || 0,
      points: fingerprint.descriptors?.points?.length || 0,
      contours: fingerprint.descriptors?.contours?.length || 0
    }
  };
}

function exportLastReport() {
  if (!lastReport) {
    setStatus('Aucune comparaison à exporter.', true);
    return;
  }
  const fileName = `profilscan-signature-lab-${safeName(lastReport.profileA.reference)}-${safeName(lastReport.profileB.reference)}.json`;
  const blob = new Blob([JSON.stringify(lastReport, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function findProfile(reference) {
  const key = String(reference || '').trim().toLowerCase();
  return collection?.profiles?.find(profile => String(profile.reference || '').trim().toLowerCase() === key) || null;
}

function setStatus(message, error = false) {
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('error', error);
}

function compactArray(value) {
  return Array.isArray(value) ? value.map(round) : [];
}

function compactNumbers(value) {
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => {
    if (typeof entry === 'number') return [key, round(entry)];
    if (Array.isArray(entry)) return [key, entry.length];
    if (entry && typeof entry === 'object') return [key, compactNumbers(entry)];
    return [key, entry];
  }));
}

function positive(...values) {
  return values.map(Number).find(value => Number.isFinite(value) && value > 0) || 100;
}

function safeName(value) {
  return String(value || 'profil').replace(/[^a-z0-9_-]+/gi, '-');
}

function round(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 10000) / 10000 : null;
}

function format(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : '-';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[character]));
}
