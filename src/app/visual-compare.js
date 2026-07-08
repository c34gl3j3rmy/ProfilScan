import { loadImageFile } from './image-import.js';
import { renderSvgTextToBitmap } from './svg-rasterizer.js';
import { computeAutoImageSettings } from './auto-settings.js';
import { getCollection } from '../storage/indexed-db.js';

const fileInput = document.querySelector('#fileInput');
const referenceInput = document.querySelector('#referenceInput');
const compareButton = document.querySelector('#compareButton');
const downloadButton = document.querySelector('#downloadButton');
const statusNode = document.querySelector('#status');

const uploadedCanvas = document.querySelector('#uploadedCanvas');
const expectedCanvas = document.querySelector('#expectedCanvas');
const diffCanvas = document.querySelector('#diffCanvas');
const uploadedStats = document.querySelector('#uploadedStats');
const expectedStats = document.querySelector('#expectedStats');
const diffStats = document.querySelector('#diffStats');

let lastComparison = null;
let analysisWorker = null;
const stageInspector = createStageInspector();

compareButton?.addEventListener('click', runVisualComparison);
downloadButton?.addEventListener('click', downloadComparisonPng);
fileInput?.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file && !referenceInput.value.trim()) referenceInput.value = referenceFromFilename(file.name);
});

async function runVisualComparison() {
  const file = fileInput?.files?.[0];
  if (!file) {
    setStatus('Selectionne un fichier SVG/image a comparer.', true);
    return;
  }

  compareButton.disabled = true;
  downloadButton.disabled = true;
  setStatus('Chargement de la base locale...');

  try {
    const collection = await getCollection();
    if (!collection?.profiles?.length) throw new Error('Base locale absente. Importe d abord dataprofils.json dans ProfilScan.');

    const expectedReference = (referenceInput.value || referenceFromFilename(file.name)).trim();
    const expectedProfile = collection.profiles.find(profile => sameReference(profile.reference, expectedReference));
    if (!expectedProfile) throw new Error('Reference attendue introuvable dans la base : ' + expectedReference);

    setStatus('Rasterisation du fichier uploade...');
    const uploadedBitmap = await loadImageFile(file);

    setStatus('Rasterisation du profil attendu depuis dataprofils.json...');
    const expectedBitmap = await renderProfileBitmap(expectedProfile);

    const uploaded = drawBitmapToCanvas(uploadedBitmap, uploadedCanvas, 'Image uploadee');
    const expected = drawBitmapToCanvas(expectedBitmap, expectedCanvas, 'Profil attendu');
    const diff = drawDiff(uploadedCanvas, expectedCanvas, diffCanvas);

    setStatus('Analyse de l image uploadee avec le worker principal...');
    const workerDiagnostics = await analyzeUploadedBitmap(uploadedBitmap, collection, expectedReference);
    const pipeline = buildPipelineInspection(uploadedCanvas, expectedCanvas, expectedProfile, diff.stats, workerDiagnostics);

    renderStats(uploadedStats, { ...uploaded.stats, worker: workerDiagnostics.summary });
    renderStats(expectedStats, { ...expected.stats, profileGeometry: pipeline.profileGeometry, signatureSummary: pipeline.expectedSignatureSummary });
    renderStats(diffStats, { ...diff.stats, firstDivergence: pipeline.firstDivergence, diagnostic: pipeline.diagnostic });
    renderPipelineInspection(pipeline);

    lastComparison = {
      fileName: file.name,
      expectedReference,
      uploadedCanvas,
      expectedCanvas,
      diffCanvas,
      uploadedStats: uploaded.stats,
      expectedStats: expected.stats,
      diffStats: diff.stats,
      pipeline
    };
    downloadButton.disabled = false;
    setStatus('Comparaison prete : ' + file.name + ' vs ' + expectedReference + ' - divergence probable : ' + pipeline.firstDivergence + '.', pipeline.hasMajorDivergence);
  } catch (error) {
    setStatus(formatError(error), true);
  } finally {
    compareButton.disabled = false;
  }
}

async function renderProfileBitmap(profile) {
  const svgText = buildProfileSvg(profile);
  return renderSvgTextToBitmap(svgText, { targetMaxSize: 1024, minSize: 384, margin: 24 });
}

function buildProfileSvg(profile) {
  const width = positiveNumber(profile.width, profile.raw?.profileWidth, 100);
  const height = positiveNumber(profile.height, profile.raw?.profileHeight, 100);
  const path = String(profile.svgPath || profile.raw?.path || '').trim();
  if (!path) throw new Error('Profil sans chemin SVG exploitable : ' + profile.reference);
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' ' + height + '"><path d="' + escapeAttribute(path) + '" fill="#000" stroke="#000" stroke-width="0.12" fill-rule="evenodd" stroke-linejoin="round" stroke-linecap="round"/></svg>';
}

async function analyzeUploadedBitmap(imageBitmap, collection, expectedReference) {
  const auto = await computeAutoImageSettings(imageBitmap);
  const settings = {
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
  const analysis = await analyzeBitmapWithWorker(imageBitmap, collection, settings);
  return summarizeWorkerAnalysis(analysis, expectedReference);
}

function analyzeBitmapWithWorker(imageBitmap, collection, settings) {
  return new Promise((resolve, reject) => {
    const worker = getAnalysisWorker();
    worker.onmessage = event => {
      const message = event.data;
      if (message?.type === 'progress') return;
      if (message?.type === 'error') reject(new Error(message.message || 'Erreur worker'));
      else resolve(message);
    };
    worker.onerror = event => reject(new Error(formatError(event)));
    worker.postMessage({ type: 'analyze', imageBitmap, collection, settings }, [imageBitmap]);
  });
}

function getAnalysisWorker() {
  if (!analysisWorker) analysisWorker = new Worker(new URL('../workers/analysis-worker.js', import.meta.url), { type: 'module' });
  return analysisWorker;
}

function summarizeWorkerAnalysis(analysis, expectedReference) {
  const firstItem = analysis.items?.[0] || null;
  const topCandidates = firstItem?.topCandidates || [];
  const expectedIndex = topCandidates.findIndex(candidate => sameReference(candidate.reference, expectedReference));
  const expectedCandidate = expectedIndex >= 0 ? topCandidates[expectedIndex] : null;
  const contours = analysis.debug?.contours || [];
  const holes = contours.reduce((sum, contour) => sum + (contour.holes?.length || 0), 0);
  const sectionCandidates = analysis.debug?.sectionCandidates || [];
  return {
    summary: {
      detectedItems: analysis.items?.length || 0,
      contours: contours.length,
      holes,
      sectionCandidates: sectionCandidates.length,
      segmentationMode: analysis.debug?.segmentationMode || null,
      bestReference: firstItem?.reference || null,
      bestScore: round(firstItem?.score),
      expectedRank: expectedIndex >= 0 ? expectedIndex + 1 : null,
      expectedScore: round(expectedCandidate?.score)
    },
    topCandidates: topCandidates.slice(0, 10).map((candidate, index) => ({ rank: index + 1, reference: candidate.reference, score: round(candidate.score), scoreDetails: candidate.scoreDetails })),
    expectedCandidate: expectedCandidate ? { rank: expectedIndex + 1, reference: expectedCandidate.reference, score: round(expectedCandidate.score), scoreDetails: expectedCandidate.scoreDetails } : null,
    debug: {
      segmentation: analysis.debug?.segmentation || null,
      segmentationMode: analysis.debug?.segmentationMode || null,
      sectionCandidates: sectionCandidates.slice(0, 8),
      contours: contours.slice(0, 4).map(contour => ({ closed: contour.closed, sectionScore: round(contour.sectionScore), points: contour.points?.length || 0, holes: contour.holes?.length || 0 }))
    }
  };
}

function buildPipelineInspection(uploadCanvas, expectedCanvas, expectedProfile, diffStats, workerDiagnostics) {
  const uploaded = analyzeCanvas(uploadCanvas);
  const expected = analyzeCanvas(expectedCanvas);
  const normalized = compareNormalizedBBoxes(uploadCanvas, expectedCanvas);
  const profileGeometry = {
    reference: expectedProfile.reference,
    width: round(expectedProfile.width),
    height: round(expectedProfile.height),
    ratio: round(expectedProfile.width / expectedProfile.height),
    surface: round(expectedProfile.surface),
    perimeter: round(expectedProfile.perimeter)
  };
  const expectedSignatureSummary = summarizeStoredSignature(expectedProfile);
  const worker = workerDiagnostics?.summary || {};

  const steps = [
    compareStep('raster-size', 'Dimensions ImageBitmap', uploaded.sourceWidth || uploaded.width, expected.sourceWidth || expected.width, 4, 'Verifier viewBox, marge et rasterisation SVG.'),
    compareStep('canvas-ratio', 'Ratio canvas', uploaded.ratio, expected.ratio, 0.02, 'Verifier orientation, viewBox et normalisation.'),
    compareStep('dark-percent', 'Pourcentage pixels noirs', uploaded.darkPercent, expected.darkPercent, 1.5, 'Verifier fill-rule, trait, remplissage et seuil de binarisation.'),
    compareStep('bbox-ratio', 'Ratio bbox noire', uploaded.bbox?.ratio, expected.bbox?.ratio, 0.03, 'Verifier bbox, rotation, centrage et marge.'),
    compareStep('bbox-fill', 'Remplissage bbox', bboxFill(uploaded), bboxFill(expected), 0.04, 'Verifier contour ferme, trous et remplissage.'),
    compareStep('normalized-diff', 'Difference apres normalisation bbox', normalized.differencePercent, 0, 5, 'Les formes comparees ne se superposent pas assez apres alignement.'),
    compareStep('final-diff', 'Difference visuelle finale', diffStats.differencePercent, 0, 5, 'La divergence est visible sur les bitmaps finaux.'),
    statusStep('worker-detection', 'Detection worker', worker.detectedItems > 0 ? 'ok' : 'mismatch', worker.detectedItems || 0, 'Aucun objet detecte par le worker principal.'),
    statusStep('candidate-search', 'Profil attendu dans le Top10 worker', worker.expectedRank ? 'ok' : 'mismatch', worker.expectedRank || 'absent', 'Le bon profil est absent des candidats du worker.'),
    statusStep('worker-top1', 'Top1 worker', sameReference(worker.bestReference, expectedProfile.reference) ? 'ok' : 'mismatch', worker.bestReference || 'aucun', 'Le worker classe un autre profil en premier.')
  ];

  const firstMismatch = steps.find(step => step.status === 'mismatch');
  return {
    firstDivergence: firstMismatch?.key || 'aucune-divergence-majeure',
    diagnostic: firstMismatch?.hint || 'Les bitmaps et le worker semblent coherents. Le probleme est probablement dans les ponderations fines ou un cas limite de scoring.',
    hasMajorDivergence: Boolean(firstMismatch),
    uploaded,
    expected,
    profileGeometry,
    expectedSignatureSummary,
    normalizedBboxComparison: normalized,
    workerDiagnostics,
    steps
  };
}

function summarizeStoredSignature(profile) {
  const fingerprint = profile.fingerprint || profile.dna || {};
  const descriptors = fingerprint.descriptors || profile.dna?.descriptors || {};
  const minutiae = fingerprint.subsignatures?.minutiae || descriptors.minutiae || fingerprint.minutiae || {};
  const localFeature = fingerprint.subsignatures?.localFeature || descriptors.localFeature || fingerprint.localFeature || {};
  return {
    pipelineMode: fingerprint.summary?.pipelineMode || null,
    fillRatio: round(fingerprint.summary?.fillRatio),
    radialBins: Array.isArray(descriptors.radial) ? descriptors.radial.length : null,
    fourierTerms: Array.isArray(descriptors.fourier) ? descriptors.fourier.length : null,
    angleBins: Array.isArray(descriptors.angle) ? descriptors.angle.length : null,
    minutiaeCounts: minutiae.counts || null,
    localFeatures: localFeature.features || null
  };
}

function compareStep(key, label, uploadedValue, expectedValue, tolerance, hint) {
  const diff = numericDiff(uploadedValue, expectedValue);
  const status = diff === null ? 'unknown' : Math.abs(diff) <= tolerance ? 'ok' : 'mismatch';
  return { key, label, uploadedValue, expectedValue, difference: diff, tolerance, status, hint: status === 'mismatch' ? hint : null };
}

function statusStep(key, label, status, value, hint) {
  return { key, label, uploadedValue: value, expectedValue: 'ok', difference: null, tolerance: null, status, hint: status === 'mismatch' ? hint : null };
}

function compareNormalizedBBoxes(uploadCanvas, expectedCanvas) {
  const size = 512;
  const left = cropToBbox(uploadCanvas, size);
  const right = cropToBbox(expectedCanvas, size);
  const diff = compareMasks(canvasMask(left), canvasMask(right));
  return { size, ...diff };
}

function cropToBbox(sourceCanvas, size) {
  const stats = analyzeCanvas(sourceCanvas);
  const target = document.createElement('canvas');
  target.width = size;
  target.height = size;
  const ctx = target.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  if (!stats.bbox) return target;
  const margin = 24;
  const scale = Math.min((size - margin * 2) / stats.bbox.width, (size - margin * 2) / stats.bbox.height);
  const drawWidth = stats.bbox.width * scale;
  const drawHeight = stats.bbox.height * scale;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(sourceCanvas, stats.bbox.x, stats.bbox.y, stats.bbox.width, stats.bbox.height, (size - drawWidth) / 2, (size - drawHeight) / 2, drawWidth, drawHeight);
  return target;
}

function drawBitmapToCanvas(bitmap, canvas, label) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const maxSize = 720;
  const scale = Math.min(maxSize / bitmap.width, maxSize / bitmap.height, 1);
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const stats = analyzeCanvas(canvas);
  stats.label = label;
  stats.sourceWidth = bitmap.width;
  stats.sourceHeight = bitmap.height;
  return { canvas, stats };
}

function drawDiff(uploaded, expected, output) {
  const width = Math.max(uploaded.width, expected.width);
  const height = Math.max(uploaded.height, expected.height);
  output.width = width;
  output.height = height;

  const ctx = output.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  const left = normalizedMask(uploaded, width, height);
  const right = normalizedMask(expected, width, height);
  const diff = compareMasks(left, right);
  const image = ctx.createImageData(width, height);

  for (let i = 0; i < left.length; i++) {
    const a = left[i];
    const b = right[i];
    const offset = i * 4;
    if (a && b) setPixel(image.data, offset, 0, 0, 0);
    else if (a) setPixel(image.data, offset, 220, 38, 38);
    else if (b) setPixel(image.data, offset, 37, 99, 235);
    else setPixel(image.data, offset, 255, 255, 255);
  }

  ctx.putImageData(image, 0, 0);
  const stats = {
    label: 'Difference visuelle',
    width,
    height,
    commonPixels: diff.commonPixels,
    onlyUploadPixels: diff.onlyUploadPixels,
    onlyExpectedPixels: diff.onlyExpectedPixels,
    emptyPixels: diff.emptyPixels,
    similarityPercent: diff.similarityPercent,
    differencePercent: diff.differencePercent,
    legend: 'noir=commun, rouge=upload seul, bleu=attendu seul'
  };
  return { canvas: output, stats };
}

function compareMasks(left, right) {
  let common = 0;
  let onlyUpload = 0;
  let onlyExpected = 0;
  let empty = 0;
  for (let i = 0; i < left.length; i++) {
    const a = left[i];
    const b = right[i];
    if (a && b) common++;
    else if (a) onlyUpload++;
    else if (b) onlyExpected++;
    else empty++;
  }
  const union = common + onlyUpload + onlyExpected;
  return {
    commonPixels: common,
    onlyUploadPixels: onlyUpload,
    onlyExpectedPixels: onlyExpected,
    emptyPixels: empty,
    similarityPercent: union ? round(common / union * 100) : 100,
    differencePercent: union ? round((onlyUpload + onlyExpected) / union * 100) : 0
  };
}

function normalizedMask(sourceCanvas, width, height) {
  const temp = document.createElement('canvas');
  temp.width = width;
  temp.height = height;
  const ctx = temp.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  const scale = Math.min(width / sourceCanvas.width, height / sourceCanvas.height);
  const drawWidth = sourceCanvas.width * scale;
  const drawHeight = sourceCanvas.height * scale;
  const offsetX = (width - drawWidth) / 2;
  const offsetY = (height - drawHeight) / 2;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(sourceCanvas, offsetX, offsetY, drawWidth, drawHeight);
  return canvasMask(temp);
}

function analyzeCanvas(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let dark = 0;
  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const offset = (y * canvas.width + x) * 4;
      if (isDark(data[offset], data[offset + 1], data[offset + 2], data[offset + 3])) {
        dark++;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  const bboxWidth = maxX >= minX ? maxX - minX + 1 : 0;
  const bboxHeight = maxY >= minY ? maxY - minY + 1 : 0;
  return {
    width: canvas.width,
    height: canvas.height,
    ratio: round(canvas.width / canvas.height),
    darkPixels: dark,
    darkPercent: round(dark / (canvas.width * canvas.height) * 100),
    bbox: bboxWidth ? { x: minX, y: minY, width: bboxWidth, height: bboxHeight, ratio: round(bboxWidth / bboxHeight) } : null
  };
}

function bboxFill(stats) {
  if (!stats?.bbox) return null;
  return round(stats.darkPixels / (stats.bbox.width * stats.bbox.height));
}

function canvasMask(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const mask = new Uint8Array(canvas.width * canvas.height);
  for (let i = 0; i < mask.length; i++) {
    const offset = i * 4;
    mask[i] = isDark(data[offset], data[offset + 1], data[offset + 2], data[offset + 3]) ? 1 : 0;
  }
  return mask;
}

function isDark(r, g, b, a) {
  if (a < 20) return false;
  return (r + g + b) / 3 < 180;
}

function renderStats(table, stats) {
  table.innerHTML = '';
  for (const [key, value] of Object.entries(stats || {})) {
    const row = document.createElement('tr');
    const th = document.createElement('th');
    const td = document.createElement('td');
    th.textContent = key;
    td.textContent = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);
    row.append(th, td);
    table.appendChild(row);
  }
}

function createStageInspector() {
  const main = document.querySelector('main');
  const section = document.createElement('section');
  section.className = 'card panel';
  section.innerHTML = '<h2>4. Inspecteur de divergence</h2><p>Analyse simplifiee des etapes ou les deux images commencent a diverger.</p><table id="stageStats"></table>';
  main?.appendChild(section);
  return section.querySelector('#stageStats');
}

function renderPipelineInspection(pipeline) {
  if (!stageInspector) return;
  stageInspector.innerHTML = '';
  addStageRow('Premiere divergence probable', pipeline.firstDivergence, pipeline.diagnostic);
  addStageRow('Signature attendue stockee', 'info', JSON.stringify(pipeline.expectedSignatureSummary));
  addStageRow('Worker Top10', 'info', JSON.stringify(pipeline.workerDiagnostics?.topCandidates?.map(candidate => ({ rank: candidate.rank, reference: candidate.reference, score: candidate.score })) || []));
  for (const step of pipeline.steps) {
    addStageRow(step.label, step.status, 'upload=' + step.uploadedValue + ' · attendu=' + step.expectedValue + ' · diff=' + step.difference + ' · tolerance=' + step.tolerance + (step.hint ? ' · ' + step.hint : ''));
  }
}

function addStageRow(label, status, detail) {
  const row = document.createElement('tr');
  const th = document.createElement('th');
  const td = document.createElement('td');
  th.textContent = label;
  td.textContent = String(status) + (detail ? ' — ' + detail : '');
  if (status === 'mismatch') td.className = 'warn';
  if (status === 'ok') td.className = 'ok';
  row.append(th, td);
  stageInspector.appendChild(row);
}

function downloadComparisonPng() {
  if (!lastComparison) return;
  const width = 1800;
  const height = 820;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#111827';
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText('ProfilScan comparaison visuelle - ' + lastComparison.fileName + ' vs ' + lastComparison.expectedReference, 32, 46);
  drawPanel(ctx, lastComparison.uploadedCanvas, 32, 82, 540, 540, 'Upload rasterise');
  drawPanel(ctx, lastComparison.expectedCanvas, 630, 82, 540, 540, 'Profil attendu base');
  drawPanel(ctx, lastComparison.diffCanvas, 1228, 82, 540, 540, 'Difference');
  ctx.font = '18px sans-serif';
  ctx.fillText('Difference: ' + lastComparison.diffStats.differencePercent + '% · Similarite: ' + lastComparison.diffStats.similarityPercent + '%', 32, 690);
  ctx.fillText('Premiere divergence probable: ' + lastComparison.pipeline.firstDivergence + ' · ' + lastComparison.pipeline.diagnostic, 32, 722);
  ctx.fillText('Top1 worker: ' + (lastComparison.pipeline.workerDiagnostics?.summary?.bestReference || 'aucun') + ' · rang attendu: ' + (lastComparison.pipeline.workerDiagnostics?.summary?.expectedRank || 'absent'), 32, 754);
  const link = document.createElement('a');
  link.href = canvas.toDataURL('image/png');
  link.download = 'profilscan-visual-compare-' + lastComparison.expectedReference + '-' + timestampForFile() + '.png';
  link.click();
}

function drawPanel(ctx, source, x, y, width, height, title) {
  ctx.strokeStyle = '#cbd5df';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, width, height);
  ctx.fillStyle = '#111827';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText(title, x, y - 12);
  const scale = Math.min((width - 24) / source.width, (height - 24) / source.height);
  const drawWidth = source.width * scale;
  const drawHeight = source.height * scale;
  ctx.drawImage(source, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

function setPixel(data, offset, r, g, b) {
  data[offset] = r;
  data[offset + 1] = g;
  data[offset + 2] = b;
  data[offset + 3] = 255;
}

function setStatus(message, isError = false) {
  if (!statusNode) return;
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

function timestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function formatError(error) {
  if (error instanceof Error && error.message) return error.message;
  if (error?.message) return String(error.message);
  if (error?.filename) return error.filename + ':' + (error.lineno || '?') + ' - ' + (error.message || 'Erreur script');
  return String(error);
}
