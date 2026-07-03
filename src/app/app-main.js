import { startCamera, stopCamera, captureFrame } from './camera.js';
import { loadImageFile } from './image-import.js';
import { renderResults } from './render-results.js';
import { bindRange, buildSettings } from './settings-reader.js';
import { getCollection, saveCollection } from '../storage/indexed-db.js';

const screens = {
  noBase: document.querySelector('#screenNoBase'),
  home: document.querySelector('#screenHome'),
  camera: document.querySelector('#screenCamera'),
  analysis: document.querySelector('#screenAnalysis'),
  result: document.querySelector('#screenResult'),
  signature: document.querySelector('#screenSignature')
};

const baseStatus = document.querySelector('#baseStatus');
const profileDbInput = document.querySelector('#profileDbInput');
const replaceProfileDbInput = document.querySelector('#replaceProfileDbInput');
const imageInput = document.querySelector('#imageInput');
const cameraButton = document.querySelector('#cameraButton');
const captureButton = document.querySelector('#captureButton');
const cancelCameraButton = document.querySelector('#cancelCameraButton');
const newAnalysisButton = document.querySelector('#newAnalysisButton');
const refreshAppButton = document.querySelector('#refreshAppButton');
const signatureDebugButton = document.querySelector('#signatureDebugButton');
const signatureSearchInput = document.querySelector('#signatureSearchInput');
const profileReferenceList = document.querySelector('#profileReferenceList');
const showSignatureButton = document.querySelector('#showSignatureButton');
const copySignatureButton = document.querySelector('#copySignatureButton');
const closeSignatureButton = document.querySelector('#closeSignatureButton');
const signatureOutput = document.querySelector('#signatureOutput');
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

let collection = null;
let analysisWorker = null;
let importWorker = null;
let sourceImage = null;
let liveTimer = null;
let liveRun = 0;

Object.values(inputs).forEach(input => {
  if (input) input.addEventListener('input', scheduleLiveAnalysis);
});

function show(name) {
  Object.values(screens).forEach(screen => {
    if (screen) screen.classList.add('hidden');
  });
  screens[name]?.classList.remove('hidden');
}

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
    show('noBase');
    return;
  }
  baseStatus.textContent = `Base chargee : ${collection.profiles.length} profils`;
  populateProfileReferenceList();
  show('home');
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
    collection = await runWorker(getImportWorker(), { type: 'import-dataprofils', text }, true);
    setProgress(92, 'Enregistrement local', 'Stockage IndexedDB');
    await saveCollection(collection);
    populateProfileReferenceList();
    setProgress(100, 'Import termine', `${collection.profiles.length} profils valides`, 'done');
    baseStatus.textContent = `Base chargee : ${collection.profiles.length} profils`;
    setTimeout(() => show('home'), 500);
  } catch (error) {
    showError(error);
  }
}

function analyzeWithSettings(progress) {
  const settings = buildSettings(inputs);
  return runWorker(getAnalysisWorker(), { type: 'analyze', imageBitmap: sourceImage, collection, settings }, progress);
}

async function analyzeImage(imageBitmap) {
  sourceImage = imageBitmap;
  show('analysis');
  resetProgress('Analyse de l image');
  setProgress(10, 'Preparation de l image', 'Image chargee');
  const result = await analyzeWithSettings(true);
  setProgress(100, 'Resultat pret', 'Affichage des detections', 'done');
  renderResults(result);
  show('result');
}

function scheduleLiveAnalysis() {
  if (!sourceImage || screens.result.classList.contains('hidden')) return;
  clearTimeout(liveTimer);
  const run = ++liveRun;
  liveTimer = setTimeout(async () => {
    try {
      document.querySelector('#detectedCount').textContent = 'Recalcul en direct...';
      const result = await analyzeWithSettings(false);
      if (run === liveRun) renderResults(result);
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
  const profile = collection?.profiles?.find(item => item.reference.toLowerCase() === reference);
  if (!profile) {
    signatureOutput.value = `Reference introuvable : ${signatureSearchInput.value}`;
    return;
  }

  signatureOutput.value = JSON.stringify(buildSignatureExport(profile), null, 2);
}

function buildSignatureExport(profile) {
  return {
    reference: profile.reference,
    designation: profile.designation,
    dimensions: {
      width: profile.width,
      height: profile.height,
      ratio: profile.ratio,
      normalizedRatio: profile.fingerprint?.summary?.normalizedRatio
    },
    summary: profile.fingerprint?.summary,
    subsignatures: {
      radial: roundArray(profile.fingerprint?.descriptors?.radial),
      angleHistogram: roundArray(profile.fingerprint?.descriptors?.angleHistogram),
      hu: roundArray(profile.fingerprint?.descriptors?.hu),
      fourier: roundArray(profile.fingerprint?.descriptors?.fourier),
      points: (profile.fingerprint?.descriptors?.points || []).slice(0, 80)
    },
    dna: {
      topology: profile.dna?.topology,
      quality: profile.dna?.quality
    }
  };
}

async function copySignatureOutput() {
  const text = signatureOutput.value.trim();
  if (!text) return;
  await copyText(text);
  copySignatureButton.textContent = 'Signature copiee';
  setTimeout(() => { copySignatureButton.textContent = 'Copier la signature'; }, 1200);
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  signatureOutput.select();
  document.execCommand('copy');
}

async function refreshApplication() {
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map(registration => registration.update()));
  }
  window.location.reload();
}

function roundArray(values) {
  if (!Array.isArray(values)) return [];
  return values.map(value => typeof value === 'number' ? Number(value.toFixed(6)) : value);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

profileDbInput.addEventListener('change', event => importBaseFromFile(event.target.files[0]));
replaceProfileDbInput.addEventListener('change', event => importBaseFromFile(event.target.files[0]));
imageInput.addEventListener('change', async event => analyzeImage(await loadImageFile(event.target.files[0])));
cameraButton.addEventListener('click', async () => { show('camera'); await startCamera(video); });
captureButton.addEventListener('click', async () => { const imageBitmap = await captureFrame(video); stopCamera(video); await analyzeImage(imageBitmap); });
cancelCameraButton.addEventListener('click', () => { stopCamera(video); show('home'); });
newAnalysisButton.addEventListener('click', () => show('home'));
refreshAppButton?.addEventListener('click', refreshApplication);
signatureDebugButton?.addEventListener('click', openSignatureScreen);
showSignatureButton?.addEventListener('click', showSignature);
copySignatureButton?.addEventListener('click', copySignatureOutput);
closeSignatureButton?.addEventListener('click', () => show('home'));
signatureSearchInput?.addEventListener('keydown', event => { if (event.key === 'Enter') showSignature(); });

boot();
