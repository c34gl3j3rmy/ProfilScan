import { loadImageFile } from './image-import.js';
import { computeAutoImageSettings } from './auto-settings.js';
import { renderSvgTextToBitmap } from './svg-rasterizer.js';
import { getCollection } from '../storage/indexed-db.js';

const fileInput = document.querySelector('#fileInput');
const referenceInput = document.querySelector('#referenceInput');
const runButton = document.querySelector('#runButton');
const statusNode = document.querySelector('#status');

const uploadOriginalCanvas = document.querySelector('#uploadOriginalCanvas');
const uploadContourCanvas = document.querySelector('#uploadContourCanvas');
const expectedOriginalCanvas = document.querySelector('#expectedOriginalCanvas');
const expectedContourCanvas = document.querySelector('#expectedContourCanvas');
const uploadTable = document.querySelector('#uploadTable');
const expectedTable = document.querySelector('#expectedTable');
const compareTable = document.querySelector('#compareTable');

let worker = null;

fileInput?.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file && !referenceInput.value.trim()) referenceInput.value = referenceFromFilename(file.name);
});
runButton?.addEventListener('click', runPipelineCompare);

async function runPipelineCompare() {
  const file = fileInput?.files?.[0];
  if (!file) {
    setStatus('Selectionne un fichier a comparer.', true);
    return;
  }

  runButton.disabled = true;
  try {
    setStatus('Chargement de la base locale...');
    const collection = await getCollection();
    if (!collection?.profiles?.length) throw new Error('Base locale absente. Importe d abord dataprofils.json dans ProfilScan.');

    const expectedReference = (referenceInput.value || referenceFromFilename(file.name)).trim();
    const expectedProfile = collection.profiles.find(profile => sameReference(profile.reference, expectedReference));
    if (!expectedProfile) throw new Error('Reference attendue introuvable dans la base : ' + expectedReference);

    setStatus('Rasterisation image uploadee et profil attendu...');
    const uploadedBitmap = await loadImageFile(file);
    const expectedBitmap = await renderExpectedProfileBitmap(expectedProfile);

    drawBitmap(uploadedBitmap, uploadOriginalCanvas);
    drawBitmap(expectedBitmap, expectedOriginalCanvas);

    setStatus('Analyse pipeline image uploadee...');
    const uploadAuto = await computeAutoImageSettings(uploadedBitmap);
    const uploadAnalysis = await analyzeBitmap(await cloneBitmap(uploadedBitmap), collection, buildWorkerSettings(uploadAuto, collection, expectedReference));

    setStatus('Analyse pipeline profil attendu...');
    const expectedAuto = await computeAutoImageSettings(expectedBitmap);
    const expectedAnalysis = await analyzeBitmap(await cloneBitmap(expectedBitmap), collection, buildWorkerSettings(expectedAuto, collection, expectedReference));

    drawContourPanel(uploadAnalysis, uploadContourCanvas);
    drawContourPanel(expectedAnalysis, expectedContourCanvas);

    const uploadSummary = summarizeAnalysis(uploadAnalysis, expectedReference);
    const expectedSummary = summarizeAnalysis(expectedAnalysis, expectedReference);
    const comparison = compareSummaries(uploadSummary, expectedSummary, expectedReference);

    renderObjectTable(uploadTable, { source: 'image uploadee', autoSettings: uploadAuto, ...uploadSummary.summary, top5: uploadSummary.top5 });
    renderObjectTable(expectedTable, { source: 'profil attendu', autoSettings: expectedAuto, ...expectedSummary.summary, top5: expectedSummary.top5 });
    renderObjectTable(compareTable, comparison);

    setStatus('Comparaison terminee : divergence probable = ' + comparison.firstDivergence + '.', comparison.firstDivergence !== 'aucune-divergence-majeure');
  } catch (error) {
    setStatus(formatError(error), true);
  } finally {
    runButton.disabled = false;
  }
}

function buildWorkerSettings(auto, collection, expectedReference) {
  return {
    expectedReference,
    image: { brightness: auto.brightness, contrast: auto.contrast, blurRadius: 1, textureSuppression: 0 },
    detection: {
      edgeQuantile: auto.edgeQuantile / 100,
      linkRadius: auto.linkRadius,
      minAreaRatio: auto.minArea / 10000,
      mergeGapRatio: auto.mergeGap / 1000
    },
    pipelineSettings: collection.pipelineSettings || null
  };
}

async function renderExpectedProfileBitmap(profile) {
  const svg = buildProfileSvg(profile);
  return renderSvgTextToBitmap(svg, { targetMaxSize: 1024, minSize: 384, margin: 24 });
}

function buildProfileSvg(profile) {
  const width = positiveNumber(profile.width, profile.raw?.profileWidth, 100);
  const height = positiveNumber(profile.height, profile.raw?.profileHeight, 100);
  const path = String(profile.svgPath || profile.raw?.path || '').trim();
  if (!path) throw new Error('Profil sans chemin SVG exploitable : ' + profile.reference);
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' ' + height + '"><path d="' + escapeAttribute(path) + '" fill="#000" stroke="#000" stroke-width="0.12" fill-rule="evenodd" stroke-linejoin="round" stroke-linecap="round"/></svg>';
}

function analyzeBitmap(imageBitmap, collection, settings) {
  return new Promise((resolve, reject) => {
    const activeWorker = getWorker();
    activeWorker.onmessage = event => {
      const message = event.data;
      if (message?.type === 'progress') {
        setStatus(message.label + ' - ' + message.detail);
        return;
      }
      if (message?.type === 'error') reject(new Error(message.message || 'Erreur worker'));
      else resolve(message);
    };
    activeWorker.onerror = event => reject(new Error(formatError(event)));
    activeWorker.postMessage({ type: 'analyze', imageBitmap, collection, settings }, [imageBitmap]);
  });
}

function getWorker() {
  if (!worker) worker = new Worker(new URL('../workers/analysis-worker.js', import.meta.url), { type: 'module' });
  return worker;
}

function summarizeAnalysis(analysis, expectedReference) {
  const item = analysis.items?.[0] || null;
  const topCandidates = item?.topCandidates || [];
  const expectedIndex = topCandidates.findIndex(candidate => sameReference(candidate.reference, expectedReference));
  const contours = analysis.debug?.contours || [];
  const sectionCandidates = analysis.debug?.sectionCandidates || [];
  const holes = contours.reduce((sum, contour) => sum + (contour.holes?.length || 0), 0);
  const top5 = topCandidates.slice(0, 5).map((candidate, index) => ({ rank: index + 1, reference: candidate.reference, score: round(candidate.score) }));
  return {
    summary: {
      imageWidth: analysis.width,
      imageHeight: analysis.height,
      detectedItems: analysis.items?.length || 0,
      contours: contours.length,
      holes,
      sectionCandidates: sectionCandidates.length,
      segmentationMode: analysis.debug?.segmentationMode || null,
      bestReference: item?.reference || null,
      bestScore: round(item?.score),
      expectedRank: expectedIndex >= 0 ? expectedIndex + 1 : null,
      expectedScore: expectedIndex >= 0 ? round(topCandidates[expectedIndex].score) : null,
      firstBox: item?.boundingBox || null
    },
    top5,
    debug: analysis.debug || {}
  };
}

function compareSummaries(upload, expected, expectedReference) {
  const uploadSummary = upload.summary;
  const expectedSummary = expected.summary;
  const checks = [
    check('detectedItems', uploadSummary.detectedItems, expectedSummary.detectedItems, 0, 'Nombre de sections detectees different.'),
    check('contours', uploadSummary.contours, expectedSummary.contours, 0, 'Nombre de contours different.'),
    check('holes', uploadSummary.holes, expectedSummary.holes, 0, 'Nombre de trous different.'),
    check('sectionCandidates', uploadSummary.sectionCandidates, expectedSummary.sectionCandidates, 1, 'Nombre de candidats de section different.'),
    checkStatus('uploadExpectedRank', uploadSummary.expectedRank === 1 ? 'ok' : 'mismatch', 'L image uploadee ne classe pas le profil attendu premier.'),
    checkStatus('expectedExpectedRank', expectedSummary.expectedRank === 1 ? 'ok' : 'mismatch', 'Le profil attendu reconstruit ne se reconnait pas lui-meme en premier.'),
    checkStatus('sameTop1', sameReference(uploadSummary.bestReference, expectedSummary.bestReference) ? 'ok' : 'mismatch', 'Le Top1 differe entre upload et profil attendu.')
  ];
  const firstMismatch = checks.find(row => row.status === 'mismatch');
  return {
    expectedReference,
    firstDivergence: firstMismatch?.key || 'aucune-divergence-majeure',
    diagnostic: firstMismatch?.hint || 'Les deux pipelines produisent des sorties proches sur les indicateurs compares.',
    uploadTop1: uploadSummary.bestReference,
    expectedTop1: expectedSummary.bestReference,
    uploadExpectedRank: uploadSummary.expectedRank || 'absent Top10',
    expectedExpectedRank: expectedSummary.expectedRank || 'absent Top10',
    uploadTop5: upload.top5,
    expectedTop5: expected.top5,
    checks
  };
}

function check(key, uploadValue, expectedValue, tolerance, hint) {
  const difference = numericDiff(uploadValue, expectedValue);
  const status = difference === null ? 'unknown' : Math.abs(difference) <= tolerance ? 'ok' : 'mismatch';
  return { key, uploadValue, expectedValue, difference, tolerance, status, hint: status === 'mismatch' ? hint : null };
}

function checkStatus(key, status, hint) {
  return { key, status, hint: status === 'mismatch' ? hint : null };
}

function drawBitmap(bitmap, canvas) {
  const ctx = canvas.getContext('2d');
  fitCanvas(canvas, bitmap.width, bitmap.height, 900, 640);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
}

function drawContourPanel(analysis, canvas) {
  const width = analysis.width || 900;
  const height = analysis.height || 640;
  const ctx = canvas.getContext('2d');
  fitCanvas(canvas, width, height, 900, 640);
  const scaleX = canvas.width / width;
  const scaleY = canvas.height / height;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (const candidate of analysis.debug?.sectionCandidates || []) {
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(candidate.x * scaleX, candidate.y * scaleY, candidate.width * scaleX, candidate.height * scaleY);
  }

  (analysis.debug?.contours || []).forEach((contour, index) => {
    drawPointPath(ctx, contour.points || [], scaleX, scaleY, index === 0 ? '#16a34a' : '#0f766e', 2);
    for (const hole of contour.holes || []) drawPointPath(ctx, hole.points || [], scaleX, scaleY, '#dc2626', 1.5);
  });
}

function drawPointPath(ctx, points, scaleX, scaleY, color, lineWidth) {
  if (!points.length) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.moveTo(points[0].x * scaleX, points[0].y * scaleY);
  for (const point of points.slice(1)) ctx.lineTo(point.x * scaleX, point.y * scaleY);
  ctx.closePath();
  ctx.stroke();
}

async function cloneBitmap(bitmap) {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  return createImageBitmap(canvas);
}

function fitCanvas(canvas, width, height, maxWidth, maxHeight) {
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
}

function renderObjectTable(table, object) {
  table.innerHTML = '';
  for (const [key, value] of Object.entries(object || {})) {
    const row = document.createElement('tr');
    const th = document.createElement('th');
    const td = document.createElement('td');
    th.textContent = key;
    td.textContent = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '');
    if (key === 'firstDivergence' && value !== 'aucune-divergence-majeure') td.className = 'warn';
    row.append(th, td);
    table.appendChild(row);
  }
}

function setStatus(message, isError = false) {
  statusNode.textContent = message;
  statusNode.className = 'status ' + (isError ? 'warn' : 'ok');
}

function referenceFromFilename(fileName) {
  const dot = fileName.lastIndexOf('.');
  return (dot > 0 ? fileName.slice(0, dot) : fileName).trim().replace(/\.min$/i, '');
}

function sameReference(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

function positiveNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return 100;
}

function numericDiff(a, b) {
  const first = Number(a);
  const second = Number(b);
  return Number.isFinite(first) && Number.isFinite(second) ? round(first - second) : null;
}

function escapeAttribute(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function round(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
}

function formatError(error) {
  if (error instanceof Error && error.message) return error.message;
  if (error?.message) return String(error.message);
  if (error?.filename) return error.filename + ':' + (error.lineno || '?') + ' - ' + (error.message || 'Erreur script');
  return String(error);
}
