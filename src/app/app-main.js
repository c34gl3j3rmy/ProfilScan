import './reset-app.js';
import { startCamera, stopCamera, captureFrame } from './camera.js';
import { loadImageFile } from './image-import.js';
import { renderPipelinePreview } from './pipeline-preview.js';
import { renderResults } from './render-results.js';
import { bindRange, buildSettings } from './settings-reader.js';
import { computeAutoImageSettings, applyAutoImageSettings } from './auto-settings.js';
import { getCollection, saveCollection } from '../storage/indexed-db.js';
import { DEFAULT_PIPELINE_SETTINGS, normalizePipelineSettings } from '../shape-engine/pipeline-settings.js';
import { buildRasterizedShapeFingerprint } from '../shape-engine/svg-raster-signature.js';

const screens = {
  noBase: document.querySelector('#screenNoBase'),
  home: document.querySelector('#screenHome'),
  camera: document.querySelector('#screenCamera'),
  analysis: document.querySelector('#screenAnalysis'),
  result: document.querySelector('#screenResult'),
  signature: document.querySelector('#screenSignature'),
  pipelineSettings: document.querySelector('#screenPipelineSettings')
};

const baseStatus = document.querySelector('#baseStatus');
const profileDbInput = document.querySelector('#profileDbInput');
const replaceProfileDbInput = document.querySelector('#replaceProfileDbInput');
const imageInput = document.querySelector('#imageInput');
const cameraButton = document.querySelector('#cameraButton');
const captureButton = document.querySelector('#captureButton');
const cancelCameraButton = document.querySelector('#cancelCameraButton');
const newAnalysisButton = document.querySelector('#newAnalysisButton');
const signatureDebugButton = document.querySelector('#signatureDebugButton');
const pipelineSettingsButton = document.querySelector('#pipelineSettingsButton');
const pipelineReferenceInput = document.querySelector('#pipelineReferenceInput');
const pipelineRandomProfileButton = document.querySelector('#pipelineRandomProfileButton');
const pipelineShowProfileButton = document.querySelector('#pipelineShowProfileButton');
const pipelinePreviewCanvas = document.querySelector('#pipelinePreviewCanvas');
const pipelinePreviewStatus = document.querySelector('#pipelinePreviewStatus');
const pipelinePreviewOutput = document.querySelector('#pipelinePreviewOutput');
const closePipelineSettingsButton = document.querySelector('#closePipelineSettingsButton');
const signatureSearchInput = document.querySelector('#signatureSearchInput');
const expectedProfileInput = document.querySelector('#expectedProfileInput');
const profileReferenceList = document.querySelector('#profileReferenceList');
const showSignatureButton = document.querySelector('#showSignatureButton');
const copySignatureButton = document.querySelector('#copySignatureButton');
const copyAnalysisReportButton = document.querySelector('#copyAnalysisReportButton');
const closeSignatureButton = document.querySelector('#closeSignatureButton');
const signatureOutput = document.querySelector('#signatureOutput');
const visionPanel = document.querySelector('#resultVisionPanel');
const compactVisionButton = document.querySelector('#compactVisionButton');
const cropImageButton = document.querySelector('#cropImageButton');
const autoSettingsButton = document.querySelector('#autoSettingsButton');
const resultCanvas = document.querySelector('#resultCanvas');
const video = document.querySelector('#cameraPreview');
const analysisStatus = document.querySelector('#analysisStatus');
const analysisProgress = document.querySelector('#analysisProgress');
const analysisPercent = document.querySelector('#analysisPercent');
const analysisDetails = document.querySelector('#analysisDetails');

const inputs = {
  brightness: bindRange('brightnessInput', 'brightnessValue', value => value),
  contrast: bindRange('contrastInput', 'contrastValue', value => value),
  edgeQuantile: bindRange('edgeQuantileInput', 'edgeQuantileValue', value => value),
  linkRadius: bindRange('linkRadiusInput', 'linkRadiusValue', value => value),
  minArea: bindRange('minAreaInput', 'minAreaValue', value => (value / 100).toFixed(2)),
  mergeGap: bindRange('mergeGapInput', 'mergeGapValue', value => (value / 10).toFixed(1)),
  weightRatio: bindRange('weightRatioInput', 'weightRatioValue', value => value),
  weightRadial: bindRange('weightRadialInput', 'weightRadialValue', value => value),
  weightHu: bindRange('weightHuInput', 'weightHuValue', value => value),
  weightFourier: bindRange('weightFourierInput', 'weightFourierValue', value => value),
  weightAngle: bindRange('weightAngleInput', 'weightAngleValue', value => value),
  weightFill: bindRange('weightFillInput', 'weightFillValue', value => value)
};

const pipelineInputs = {
  fillGridSize: bindRange('pipelineFillGridInput', 'pipelineFillGridValue', value => value),
  contourPointCount: bindRange('pipelineContourPointInput', 'pipelineContourPointValue', value => value),
  simplifyEpsilon: bindRange('pipelineSimplifyInput', 'pipelineSimplifyValue', value => (value / 1000).toFixed(3))
};

let collection = null;
let analysisWorker = null;
let importWorker = null;
let sourceImage = null;
let lastResult = null;
let lastAutoSettings = null;
let liveTimer = null;
let liveRun = 0;
let cropMode = false;
let cropStart = null;
let cropBox = null;
let cropDragging = false;
let currentPipelineSettings = normalizePipelineSettings(DEFAULT_PIPELINE_SETTINGS);
let pipelinePreviewTimer = null;
let pipelinePreviewRun = 0;
let currentScreen = null;
let restoringHistory = false;

Object.values(inputs).forEach(input => {
  if (input) input.addEventListener('input', scheduleLiveAnalysis);
});

Object.values(pipelineInputs).forEach(input => {
  if (input) input.addEventListener('input', schedulePipelinePreview);
});

function show(name, options = {}) {
  const { replace = false, history = true } = options;
  Object.values(screens).forEach(screen => {
    if (screen) screen.classList.add('hidden');
  });
  screens[name]?.classList.remove('hidden');
  currentScreen = name;

  if (history && !restoringHistory) updateHistory(name, replace);
}

function updateHistory(screen, replace) {
  const state = { profilScanScreen: screen };
  if (replace || !history.state?.profilScanScreen) history.replaceState(state, '', window.location.pathname);
  else history.pushState(state, '', window.location.pathname);
}

function goBackSafe() {
  if (currentScreen && currentScreen !== 'home' && currentScreen !== 'noBase') history.back();
  else show('home', { replace: true });
}

window.addEventListener('popstate', event => {
  const target = event.state?.profilScanScreen || (collection ? 'home' : 'noBase');
  restoringHistory = true;
  if (currentScreen === 'camera' && target !== 'camera') stopCamera(video);
  exitCropMode();
  show(target, { history: false });
  restoringHistory = false;
});

function resetProgress(label = 'Preparation') {
  analysisProgress.value = 0;
  analysisPercent.textContent = '0 %';
  analysisStatus.textContent = label;
  analysisDetails.innerHTML = '';
}

function setProgress(percent, label, detail, className = '') {
  const safePercent = Math.max(0, Math.min(100, Math.round(percent)));
  analysisProgress.value = safePercent;
  analysisPercent.textContent = `${safePercent} %`;
  analysisStatus.textContent = label;
  if (!detail) return;
  const item = document.createElement('li');
  item.textContent = detail;
  if (className) item.classList.add(className);
  analysisDetails.appendChild(item);
  analysisDetails.scrollTop = analysisDetails.scrollHeight;
}

function formatError(error) {
  if (error instanceof Error && error.message) return error.message;
  if (error?.message) return String(error.message);
  if (error?.filename) return `${error.filename}:${error.lineno || '?'} - ${error.message || 'Erreur script'}`;
  if (error?.type) return `Evenement ${error.type}`;
  return String(error);
}

function showError(error, fallbackScreen = 'noBase') {
  const message = formatError(error);
  setProgress(100, 'Erreur', message, 'error');
  baseStatus.textContent = 'Erreur : ' + message;
  setTimeout(() => show(fallbackScreen), 2200);
}

async function boot() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js');
  collection = await getCollection();
  if (!collection) {
    baseStatus.textContent = 'Base locale absente';
    show('noBase', { replace: true });
    return;
  }
  currentPipelineSettings = normalizePipelineSettings(collection.pipelineSettings || DEFAULT_PIPELINE_SETTINGS);
  applyPipelineSettingsToInputs(currentPipelineSettings, false);
  baseStatus.textContent = `Base chargee : ${collection.profiles.length} profils`;
  populateProfileReferenceList();
  show('home', { replace: true });
}

function getImportWorker() {
  if (!importWorker) importWorker = new Worker(new URL('../workers/import-worker.js', import.meta.url), { type: 'module' });
  return importWorker;
}

function getAnalysisWorker() {
  if (!analysisWorker) analysisWorker = new Worker(new URL('../workers/analysis-worker.js', import.meta.url), { type: 'module' });
  return analysisWorker;
}

function runWorker(worker, payload, progress) {
  return new Promise((resolve, reject) => {
    worker.onmessage = event => {
      const message = event.data;
      if (message?.type === 'progress') {
        if (progress) setProgress(message.percent, message.label, message.detail);
        return;
      }
      if (message?.type === 'error') reject(new Error(message.message || 'Erreur worker'));
      else if (message?.type === 'done') resolve(message.collection);
      else resolve(message);
    };
    worker.onerror = event => reject(new Error(formatError(event)));
    worker.postMessage(payload);
  });
}

async function importBaseFromFile(file) {
  if (!file) return;
  show('analysis');
  resetProgress('Import de la base profils');
  try {
    setProgress(5, 'Lecture du fichier', `Fichier : ${file.name}`);
    const text = await file.text();
    collection = await runWorker(getImportWorker(), { type: 'import-dataprofils', text, pipelineSettings: currentPipelineSettings }, true);
    currentPipelineSettings = normalizePipelineSettings(collection.pipelineSettings || currentPipelineSettings);
    applyPipelineSettingsToInputs(currentPipelineSettings, false);
    setProgress(92, 'Enregistrement local', 'Stockage IndexedDB');
    await saveCollection(collection);
    populateProfileReferenceList();
    setProgress(100, 'Import termine', `${collection.profiles.length} profils valides`, 'done');
    baseStatus.textContent = `Base chargee : ${collection.profiles.length} profils`;
    setTimeout(() => show('home', { replace: true }), 500);
  } catch (error) {
    showError(error);
  }
}

function analyzeWithSettings(progress) {
  const settings = buildSettings(inputs);
  settings.pipelineSettings = currentPipelineSettings;
  return runWorker(getAnalysisWorker(), { type: 'analyze', imageBitmap: sourceImage, collection, settings }, progress);
}

async function applyAutoSettings(imageBitmap = sourceImage) {
  if (!imageBitmap) return null;
  lastAutoSettings = await computeAutoImageSettings(imageBitmap);
  applyAutoImageSettings(inputs, lastAutoSettings);
  return lastAutoSettings;
}

async function analyzeImage(imageBitmap) {
  sourceImage = imageBitmap;
  exitCropMode();
  show('analysis');
  resetProgress('Analyse de l image');
  setProgress(6, 'Auto-reglage', 'Calcul des seuils image');
  const autoSettings = await applyAutoSettings(imageBitmap);
  setProgress(10, 'Preparation de l image', `Seuil contour auto : ${autoSettings.edgeQuantile} %`);
  const result = await analyzeWithSettings(true);
  lastResult = result;
  setProgress(100, 'Resultat pret', 'Affichage des detections', 'done');
  renderResults(result);
  show('result', { replace: true });
}

async function rerunAutoSettings() {
  if (!sourceImage || !autoSettingsButton) return;
  try {
    autoSettingsButton.textContent = 'Calcul auto...';
    const autoSettings = await applyAutoSettings();
    document.querySelector('#detectedCount').textContent = `Reglage auto : seuil ${autoSettings.edgeQuantile} %`;
    const result = await analyzeWithSettings(false);
    lastResult = result;
    renderResults(result);
    autoSettingsButton.textContent = 'Reglage auto applique';
    setTimeout(() => { autoSettingsButton.textContent = 'Reglage auto'; }, 1200);
  } catch (error) {
    autoSettingsButton.textContent = 'Erreur reglage auto';
    document.querySelector('#detectedCount').textContent = 'Erreur reglage auto : ' + formatError(error);
    setTimeout(() => { autoSettingsButton.textContent = 'Reglage auto'; }, 1600);
  }
}

function scheduleLiveAnalysis() {
  if (!sourceImage || screens.result.classList.contains('hidden')) return;
  clearTimeout(liveTimer);
  const run = ++liveRun;
  liveTimer = setTimeout(async () => {
    try {
      document.querySelector('#detectedCount').textContent = 'Recalcul en direct...';
      const result = await analyzeWithSettings(false);
      if (run === liveRun) {
        lastResult = result;
        renderResults(result);
      }
    } catch (error) {
      document.querySelector('#detectedCount').textContent = 'Erreur recalcul : ' + formatError(error);
    }
  }, 180);
}

function populateProfileReferenceList() {
  if (!profileReferenceList || !collection?.profiles?.length) return;
  profileReferenceList.innerHTML = collection.profiles
    .map(profile => `<option value="${escapeHtml(profile.reference)}">${escapeHtml(profile.designation || '')}</option>`)
    .join('');
}

function openSignatureScreen() {
  populateProfileReferenceList();
  signatureOutput.value = '';
  show('signature');
  signatureSearchInput?.focus();
}

function showSignature() {
  const reference = signatureSearchInput.value.trim().toLowerCase();
  const profile = findProfile(reference);
  if (!profile) {
    signatureOutput.value = `Reference introuvable : ${signatureSearchInput.value}`;
    return;
  }

  signatureOutput.value = JSON.stringify(buildSignatureExport(profile), null, 2);
}

function buildSignatureExport(profile, fingerprint = profile.fingerprint) {
  return {
    reference: profile.reference,
    designation: profile.designation,
    dimensions: {
      width: profile.width,
      height: profile.height,
      ratio: profile.ratio,
      normalizedRatio: fingerprint?.summary?.normalizedRatio
    },
    pipelineSettings: fingerprint?.pipelineSettings || profile.pipelineSettings || collection?.pipelineSettings || currentPipelineSettings,
    summary: fingerprint?.summary,
    subsignatures: {
      radial: roundArray(fingerprint?.descriptors?.radial),
      angleHistogram: roundArray(fingerprint?.descriptors?.angleHistogram),
      hu: roundArray(fingerprint?.descriptors?.hu),
      fourier: roundArray(fingerprint?.descriptors?.fourier),
      points: (fingerprint?.descriptors?.points || []).slice(0, 80)
    },
    dna: {
      topology: profile.dna?.topology,
      quality: profile.dna?.quality
    }
  };
}

function openPipelineSettingsScreen() {
  populateProfileReferenceList();
  applyPipelineSettingsToInputs(currentPipelineSettings, false);
  show('pipelineSettings');
  if (!pipelineReferenceInput.value && collection?.profiles?.length) selectRandomPipelineProfile();
  else updatePipelinePreview();
}

function buildPipelineSettingsFromInputs() {
  currentPipelineSettings = normalizePipelineSettings({
    ...currentPipelineSettings,
    fillGridSize: pipelineInputs.fillGridSize?.value,
    contourPointCount: pipelineInputs.contourPointCount?.value,
    simplifyEpsilon: (Number(pipelineInputs.simplifyEpsilon?.value) || 0) / 1000
  });
  return currentPipelineSettings;
}

function applyPipelineSettingsToInputs(settings, updatePreview = true) {
  const normalized = normalizePipelineSettings(settings);
  if (pipelineInputs.fillGridSize) pipelineInputs.fillGridSize.value = normalized.fillGridSize;
  if (pipelineInputs.contourPointCount) pipelineInputs.contourPointCount.value = normalized.contourPointCount;
  if (pipelineInputs.simplifyEpsilon) pipelineInputs.simplifyEpsilon.value = Math.round(normalized.simplifyEpsilon * 1000);
  Object.values(pipelineInputs).forEach(input => input?.dispatchEvent(new Event('input')));
  if (updatePreview && currentScreen === 'pipelineSettings') schedulePipelinePreview();
}

function schedulePipelinePreview() {
  if (currentScreen !== 'pipelineSettings') return;
  clearTimeout(pipelinePreviewTimer);
  const settings = buildPipelineSettingsFromInputs();
  const reference = pipelineReferenceInput?.value.trim().toLowerCase();
  const profile = findProfile(reference) || collection?.profiles?.[0];
  if (profile) {
    pipelinePreviewStatus.textContent = `${profile.reference} - recalcul en direct... · grille ${settings.fillGridSize} x ${settings.fillGridSize}`;
  }
  pipelinePreviewTimer = setTimeout(updatePipelinePreview, 80);
}

function selectRandomPipelineProfile() {
  if (!collection?.profiles?.length) return;
  const profile = collection.profiles[Math.floor(Math.random() * collection.profiles.length)];
  pipelineReferenceInput.value = profile.reference;
  updatePipelinePreview();
}

async function updatePipelinePreview() {
  if (!pipelinePreviewOutput) return;
  const run = ++pipelinePreviewRun;
  const settings = buildPipelineSettingsFromInputs();
  const reference = pipelineReferenceInput?.value.trim().toLowerCase();
  const profile = findProfile(reference) || collection?.profiles?.[0];

  if (!profile) {
    pipelinePreviewStatus.textContent = 'Aucun profil disponible.';
    pipelinePreviewOutput.value = '';
    clearPipelinePreviewCanvas();
    return;
  }

  pipelinePreviewStatus.textContent = `${profile.reference} - ${profile.designation || 'Sans designation'} · calcul de l'aperçu...`;
  try {
    const fingerprint = await buildRasterizedShapeFingerprint(profile, settings);
    if (run !== pipelinePreviewRun) return;
    const previewFingerprint = fingerprint || profile.fingerprint;
    renderPipelinePreview(pipelinePreviewCanvas, profile, previewFingerprint);
    pipelinePreviewStatus.textContent = `${profile.reference} - ${profile.designation || 'Sans designation'} · ${previewFingerprint?.summary?.source || 'signature'} · grille ${settings.fillGridSize} x ${settings.fillGridSize}`;
    pipelinePreviewOutput.value = JSON.stringify(buildSignatureExport(profile, previewFingerprint), null, 2);
  } catch (error) {
    if (run !== pipelinePreviewRun) return;
    renderPipelinePreview(pipelinePreviewCanvas, profile, profile.fingerprint);
    pipelinePreviewStatus.textContent = `${profile.reference} - aperçu raster indisponible : ${formatError(error)}`;
    pipelinePreviewOutput.value = JSON.stringify(buildSignatureExport(profile), null, 2);
  }
}

function clearPipelinePreviewCanvas() {
  if (!pipelinePreviewCanvas) return;
  const ctx = pipelinePreviewCanvas.getContext('2d');
  ctx.clearRect(0, 0, pipelinePreviewCanvas.width, pipelinePreviewCanvas.height);
}

async function copySignatureOutput() {
  const text = signatureOutput.value.trim();
  if (!text) return;
  await copyText(text);
  copySignatureButton.textContent = 'Signature copiee';
  setTimeout(() => { copySignatureButton.textContent = 'Copier la signature'; }, 1200);
}

async function copyAnalysisReport() {
  if (!lastResult) return;
  const report = buildAnalysisReport();
  await copyText(JSON.stringify(report, null, 2));
  copyAnalysisReportButton.textContent = 'Rapport copie';
  setTimeout(() => { copyAnalysisReportButton.textContent = "Copier le rapport d'analyse"; }, 1200);
}

function buildAnalysisReport() {
  const expected = findProfile(expectedProfileInput?.value.trim().toLowerCase());
  const best = lastResult.items?.[0] || null;
  const expectedCandidate = expected ? findCandidate(expected.reference) : null;

  return {
    type: 'ProfilScan analysis report',
    generatedAt: new Date().toISOString(),
    pipelineSettings: currentPipelineSettings,
    base: {
      name: collection?.name,
      profiles: collection?.profiles?.length,
      importedAt: collection?.importedAt,
      pipelineSettings: collection?.pipelineSettings
    },
    image: {
      width: lastResult.width,
      height: lastResult.height,
      detectedItems: lastResult.items?.length || 0,
      contours: lastResult.debug?.contours?.length || 0,
      holes: (lastResult.debug?.contours || []).reduce((sum, contour) => sum + (contour.holes?.length || 0), 0),
      crop: cropBox
    },
    autoSettings: lastAutoSettings,
    settings: lastResult.settings,
    expectedProfile: expected ? buildSignatureExport(expected) : null,
    bestMatch: best,
    expectedCandidate,
    topCandidates: (best?.topCandidates || []).slice(0, 10).map(candidate => ({
      reference: candidate.reference,
      designation: candidate.designation,
      score: candidate.score,
      scoreDetails: candidate.scoreDetails
    })),
    detectedSignature: {
      scoreDetails: best?.scoreDetails || null,
      boundingBox: best?.boundingBox || null,
      debugContours: (lastResult.debug?.contours || []).slice(0, 3)
    }
  };
}

function findCandidate(reference) {
  const target = String(reference || '').toLowerCase();
  for (const item of lastResult.items || []) {
    const candidate = item.topCandidates?.find(entry => entry.reference.toLowerCase() === target);
    if (candidate) return candidate;
  }
  return null;
}

function findProfile(reference) {
  if (!reference) return null;
  return collection?.profiles?.find(item => item.reference.toLowerCase() === reference) || null;
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  signatureOutput.value = text;
  signatureOutput.select();
  document.execCommand('copy');
}

function toggleCompactVision() {
  visionPanel?.classList.toggle('compact');
  const active = visionPanel?.classList.contains('compact');
  compactVisionButton.textContent = active ? 'Image normale' : 'Image compacte';
}

async function toggleCropMode() {
  if (!sourceImage) return;
  if (cropMode && cropBox) {
    await applyCrop();
    return;
  }
  cropMode = !cropMode;
  cropBox = null;
  cropStart = null;
  cropDragging = false;
  resultCanvas?.classList.toggle('crop-mode', cropMode);
  cropImageButton.textContent = cropMode ? 'Trace la zone' : 'Recadrer';
  if (lastResult) renderResults(lastResult);
}

function exitCropMode() {
  cropMode = false;
  cropStart = null;
  cropDragging = false;
  cropBox = null;
  resultCanvas?.classList.remove('crop-mode');
  if (cropImageButton) cropImageButton.textContent = 'Recadrer';
}

function startCrop(event) {
  if (!cropMode || !lastResult) return;
  cropDragging = true;
  cropStart = canvasPoint(event);
  cropBox = { x: cropStart.x, y: cropStart.y, width: 0, height: 0 };
  resultCanvas.setPointerCapture(event.pointerId);
}

function moveCrop(event) {
  if (!cropMode || !cropDragging || !cropStart || !lastResult) return;
  const point = canvasPoint(event);
  cropBox = normalizeCropBox(cropStart, point);
  renderCropPreview();
}

function endCrop() {
  if (!cropMode || !cropDragging) return;
  cropDragging = false;
  if (!cropBox || cropBox.width < 20 || cropBox.height < 20) {
    cropBox = null;
    cropImageButton.textContent = 'Trace la zone';
    if (lastResult) renderResults(lastResult);
    return;
  }
  cropImageButton.textContent = 'Appliquer recadrage';
  renderCropPreview();
}

async function applyCrop() {
  if (!cropBox || !sourceImage) return;
  const cropped = await createCroppedBitmap(sourceImage, cropBox);
  await analyzeImage(cropped);
}

async function createCroppedBitmap(imageBitmap, box) {
  const width = Math.max(1, Math.round(box.width));
  const height = Math.max(1, Math.round(box.height));
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height) : document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imageBitmap, Math.round(box.x), Math.round(box.y), width, height, 0, 0, width, height);
  return createImageBitmap(canvas);
}

function renderCropPreview() {
  renderResults(lastResult);
  const ctx = resultCanvas.getContext('2d');
  ctx.save();
  ctx.fillStyle = 'rgba(15,23,42,.35)';
  ctx.fillRect(0, 0, resultCanvas.width, resultCanvas.height);
  if (cropBox) {
    ctx.clearRect(cropBox.x, cropBox.y, cropBox.width, cropBox.height);
    renderResults(lastResult);
    ctx.save();
    ctx.fillStyle = 'rgba(15,23,42,.35)';
    ctx.fillRect(0, 0, resultCanvas.width, cropBox.y);
    ctx.fillRect(0, cropBox.y + cropBox.height, resultCanvas.width, resultCanvas.height - cropBox.y - cropBox.height);
    ctx.fillRect(0, cropBox.y, cropBox.x, cropBox.height);
    ctx.fillRect(cropBox.x + cropBox.width, cropBox.y, resultCanvas.width - cropBox.x - cropBox.width, cropBox.height);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = Math.max(2, resultCanvas.width / 350);
    ctx.strokeRect(cropBox.x, cropBox.y, cropBox.width, cropBox.height);
    ctx.restore();
  }
  ctx.restore();
}

function canvasPoint(event) {
  const rect = resultCanvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) * (resultCanvas.width / rect.width);
  const y = (event.clientY - rect.top) * (resultCanvas.height / rect.height);
  return {
    x: Math.max(0, Math.min(resultCanvas.width, x)),
    y: Math.max(0, Math.min(resultCanvas.height, y))
  };
}

function normalizeCropBox(a, b) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y)
  };
}

function roundArray(values) {
  if (!Array.isArray(values)) return [];
  return values.map(value => typeof value === 'number' ? Number(value.toFixed(6)) : value);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

profileDbInput?.addEventListener('change', event => importBaseFromFile(event.target.files[0]));
replaceProfileDbInput?.addEventListener('change', event => importBaseFromFile(event.target.files[0]));
imageInput?.addEventListener('change', async event => analyzeImage(await loadImageFile(event.target.files[0])));
cameraButton?.addEventListener('click', async () => { show('camera'); await startCamera(video); });
captureButton?.addEventListener('click', async () => { const imageBitmap = await captureFrame(video); stopCamera(video); await analyzeImage(imageBitmap); });
cancelCameraButton?.addEventListener('click', () => { stopCamera(video); goBackSafe(); });
newAnalysisButton?.addEventListener('click', () => show('home'));
signatureDebugButton?.addEventListener('click', openSignatureScreen);
pipelineSettingsButton?.addEventListener('click', openPipelineSettingsScreen);
pipelineRandomProfileButton?.addEventListener('click', selectRandomPipelineProfile);
pipelineShowProfileButton?.addEventListener('click', updatePipelinePreview);
closePipelineSettingsButton?.addEventListener('click', goBackSafe);
showSignatureButton?.addEventListener('click', showSignature);
copySignatureButton?.addEventListener('click', copySignatureOutput);
copyAnalysisReportButton?.addEventListener('click', copyAnalysisReport);
autoSettingsButton?.addEventListener('click', rerunAutoSettings);
compactVisionButton?.addEventListener('click', toggleCompactVision);
cropImageButton?.addEventListener('click', toggleCropMode);
resultCanvas?.addEventListener('pointerdown', startCrop);
resultCanvas?.addEventListener('pointermove', moveCrop);
resultCanvas?.addEventListener('pointerup', endCrop);
resultCanvas?.addEventListener('pointercancel', endCrop);
closeSignatureButton?.addEventListener('click', goBackSafe);
signatureSearchInput?.addEventListener('keydown', event => { if (event.key === 'Enter') showSignature(); });
pipelineReferenceInput?.addEventListener('keydown', event => { if (event.key === 'Enter') updatePipelinePreview(); });
pipelineReferenceInput?.addEventListener('input', schedulePipelinePreview);

boot();
