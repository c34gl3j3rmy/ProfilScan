import { loadImageFile } from './image-import.js';
import { computeAutoImageSettings } from './auto-settings.js';
import { getCollection } from '../storage/indexed-db.js';

const fileInput = document.querySelector('#fileInput');
const referenceInput = document.querySelector('#referenceInput');
const runButton = document.querySelector('#runButton');
const statusNode = document.querySelector('#status');
const overlayCanvas = document.querySelector('#overlayCanvas');
const contourCanvas = document.querySelector('#contourCanvas');
const diagnosticTable = document.querySelector('#diagnosticTable');
const topTable = document.querySelector('#topTable');

let worker = null;
let lastImageBitmap = null;

fileInput?.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file && !referenceInput.value.trim()) referenceInput.value = referenceFromFilename(file.name);
});
runButton?.addEventListener('click', runPipelineDebug);

async function runPipelineDebug() {
  const file = fileInput?.files?.[0];
  if (!file) {
    setStatus('Selectionne un fichier a analyser.', true);
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

    setStatus('Chargement et reglages automatiques...');
    const imageBitmap = await loadImageFile(file);
    lastImageBitmap = imageBitmap;
    const auto = await computeAutoImageSettings(imageBitmap);
    const settings = buildWorkerSettings(auto, collection, expectedReference);

    setStatus('Analyse avec le worker principal...');
    const analysis = await analyzeBitmap(imageBitmap, collection, settings);
    const diagnostics = summarizeAnalysis(analysis, expectedReference);

    drawOverlay(lastImageBitmap, analysis, overlayCanvas);
    drawContours(analysis, contourCanvas);
    renderDiagnostics(diagnostics, expectedProfile, auto);
    renderTopCandidates(diagnostics.topCandidates, expectedReference);
    setStatus('Inspection terminee : Top1 ' + (diagnostics.summary.bestReference || 'aucun') + ', attendu rang ' + (diagnostics.summary.expectedRank || 'absent Top10') + '.', diagnostics.summary.expectedRank !== 1);
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
  const firstItem = analysis.items?.[0] || null;
  const topCandidates = firstItem?.topCandidates || [];
  const expectedIndex = topCandidates.findIndex(candidate => sameReference(candidate.reference, expectedReference));
  const contours = analysis.debug?.contours || [];
  const holes = contours.reduce((sum, contour) => sum + (contour.holes?.length || 0), 0);
  return {
    summary: {
      imageWidth: analysis.width,
      imageHeight: analysis.height,
      detectedItems: analysis.items?.length || 0,
      contours: contours.length,
      holes,
      segmentationMode: analysis.debug?.segmentationMode || null,
      sectionCandidates: analysis.debug?.sectionCandidates?.length || 0,
      bestReference: firstItem?.reference || null,
      bestScore: round(firstItem?.score),
      expectedRank: expectedIndex >= 0 ? expectedIndex + 1 : null,
      expectedScore: expectedIndex >= 0 ? round(topCandidates[expectedIndex].score) : null
    },
    debug: analysis.debug || {},
    topCandidates: topCandidates.slice(0, 10).map((candidate, index) => ({
      rank: index + 1,
      reference: candidate.reference,
      score: round(candidate.score),
      designation: candidate.designation,
      scoreDetails: summarizeScoreDetails(candidate.scoreDetails)
    }))
  };
}

function drawOverlay(imageBitmap, analysis, canvas) {
  const ctx = canvas.getContext('2d');
  fitCanvasToImage(canvas, imageBitmap, 900, 700);
  const scaleX = canvas.width / imageBitmap.width;
  const scaleY = canvas.height / imageBitmap.height;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(imageBitmap, 0, 0, canvas.width, canvas.height);

  ctx.lineWidth = 2;
  for (const candidate of analysis.debug?.sectionCandidates || []) {
    ctx.strokeStyle = '#2563eb';
    ctx.strokeRect(candidate.x * scaleX, candidate.y * scaleY, candidate.width * scaleX, candidate.height * scaleY);
    ctx.fillStyle = '#2563eb';
    ctx.font = '14px sans-serif';
    ctx.fillText(round(candidate.score || 0), candidate.x * scaleX + 4, candidate.y * scaleY + 16);
  }
}

function drawContours(analysis, canvas) {
  const ctx = canvas.getContext('2d');
  const width = analysis.width || 900;
  const height = analysis.height || 700;
  fitCanvasToSize(canvas, width, height, 900, 700);
  const scaleX = canvas.width / width;
  const scaleY = canvas.height / height;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const contours = analysis.debug?.contours || [];
  contours.forEach((contour, index) => {
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

function fitCanvasToImage(canvas, imageBitmap, maxWidth, maxHeight) {
  fitCanvasToSize(canvas, imageBitmap.width, imageBitmap.height, maxWidth, maxHeight);
}

function fitCanvasToSize(canvas, width, height, maxWidth, maxHeight) {
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
}

function renderDiagnostics(diagnostics, expectedProfile, auto) {
  const rows = {
    expectedReference: expectedProfile.reference,
    expectedDesignation: expectedProfile.designation,
    expectedGeometry: { width: round(expectedProfile.width), height: round(expectedProfile.height), ratio: round(expectedProfile.ratio), surface: round(expectedProfile.surface), perimeter: round(expectedProfile.perimeter) },
    autoSettings: auto,
    ...diagnostics.summary,
    segmentation: diagnostics.debug.segmentation || null,
    contourPreview: (diagnostics.debug.contours || []).slice(0, 4).map(contour => ({ closed: contour.closed, points: contour.points?.length || 0, holes: contour.holes?.length || 0, sectionScore: round(contour.sectionScore) }))
  };
  renderObjectTable(diagnosticTable, rows);
}

function renderTopCandidates(candidates, expectedReference) {
  topTable.innerHTML = '';
  const header = document.createElement('tr');
  ['rang', 'reference', 'score', 'designation', 'details'].forEach(text => {
    const th = document.createElement('th');
    th.textContent = text;
    header.appendChild(th);
  });
  topTable.appendChild(header);
  for (const candidate of candidates) {
    const row = document.createElement('tr');
    if (sameReference(candidate.reference, expectedReference)) row.className = 'ok';
    [candidate.rank, candidate.reference, candidate.score, candidate.designation, candidate.scoreDetails].forEach(value => {
      const td = document.createElement('td');
      td.textContent = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '');
      row.appendChild(td);
    });
    topTable.appendChild(row);
  }
}

function renderObjectTable(table, object) {
  table.innerHTML = '';
  for (const [key, value] of Object.entries(object || {})) {
    const row = document.createElement('tr');
    const th = document.createElement('th');
    const td = document.createElement('td');
    th.textContent = key;
    td.textContent = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '');
    row.append(th, td);
    table.appendChild(row);
  }
}

function summarizeScoreDetails(scoreDetails) {
  if (!scoreDetails) return null;
  return {
    total: round(scoreDetails.total ?? scoreDetails.score),
    subscores: pickNumericMap(scoreDetails.subscores),
    gates: pickNumericMap(scoreDetails.gates),
    penalties: pickNumericMap(scoreDetails.penalties),
    advanced: pickNumericMap(scoreDetails.advanced)
  };
}

function pickNumericMap(value) {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => Number.isFinite(Number(entry))).map(([key, entry]) => [key, round(entry)]));
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
