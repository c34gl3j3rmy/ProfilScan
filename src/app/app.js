import { startCamera, stopCamera, captureFrame } from './camera.js';
import { loadImageFile } from './image-import.js';
import { renderResults } from './render-results.js';
import { getCollection, saveCollection } from '../storage/indexed-db.js';

const screens = {
  noBase: document.querySelector('#screenNoBase'),
  home: document.querySelector('#screenHome'),
  camera: document.querySelector('#screenCamera'),
  analysis: document.querySelector('#screenAnalysis'),
  result: document.querySelector('#screenResult')
};

const baseStatus = document.querySelector('#baseStatus');
const profileDbInput = document.querySelector('#profileDbInput');
const replaceProfileDbInput = document.querySelector('#replaceProfileDbInput');
const imageInput = document.querySelector('#imageInput');
const cameraButton = document.querySelector('#cameraButton');
const captureButton = document.querySelector('#captureButton');
const cancelCameraButton = document.querySelector('#cancelCameraButton');
const newAnalysisButton = document.querySelector('#newAnalysisButton');
const video = document.querySelector('#cameraPreview');
const analysisStatus = document.querySelector('#analysisStatus');
const analysisProgress = document.querySelector('#analysisProgress');
const analysisPercent = document.querySelector('#analysisPercent');
const analysisDetails = document.querySelector('#analysisDetails');

const debugInputs = {
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

function show(name) {
  Object.values(screens).forEach(screen => screen.classList.add('hidden'));
  screens[name].classList.remove('hidden');
}

function bindRange(inputId, outputId, formatter) {
  const input = document.querySelector(`#${inputId}`);
  const output = document.querySelector(`#${outputId}`);
  if (!input || !output) return null;

  const sync = () => {
    output.textContent = formatter(Number(input.value));
  };
  input.addEventListener('input', sync);
  sync();
  return input;
}

function getDebugSettings() {
  return {
    detection: {
      edgeQuantile: numberValue(debugInputs.edgeQuantile, 82) / 100,
      linkRadius: numberValue(debugInputs.linkRadius, 5),
      minAreaRatio: numberValue(debugInputs.minArea, 7) / 10000,
      mergeGapRatio: numberValue(debugInputs.mergeGap, 45) / 1000
    },
    weights: {
      ratio: numberValue(debugInputs.weightRatio, 25),
      radial: numberValue(debugInputs.weightRadial, 22),
      hu: numberValue(debugInputs.weightHu, 20),
      fourier: numberValue(debugInputs.weightFourier, 18),
      angle: numberValue(debugInputs.weightAngle, 10),
      fill: numberValue(debugInputs.weightFill, 5)
    }
  };
}

function numberValue(input, fallback) {
  const value = Number(input?.value);
  return Number.isFinite(value) ? value : fallback;
}

function resetProgress(label = 'Preparation') {
  analysisProgress.value = 0;
  analysisPercent.textContent = '0 %';
  analysisStatus.textContent = label;
  analysisDetails.innerHTML = '';
}

function formatError(error) {
  if (error instanceof Error && error.message) return error.message;
  if (error?.message) return String(error.message);
  if (error?.filename) return `${error.filename}:${error.lineno || '?'} - ${error.message || 'Erreur script'}`;
  if (error?.type) return `Evenement ${error.type}`;
  return String(error);
}

function addLog(detail, className = '') {
  if (!detail) return;
  const item = document.createElement('li');
  item.textContent = detail;
  if (className) item.classList.add(className);
  analysisDetails.appendChild(item);
  analysisDetails.scrollTop = analysisDetails.scrollHeight;
}

function setProgress(percent, label, detail, className = '') {
  const safePercent = Math.max(0, Math.min(100, Math.round(percent)));
  analysisProgress.value = safePercent;
  analysisPercent.textContent = `${safePercent} %`;
  analysisStatus.textContent = label;
  addLog(detail, className);
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
  show('home');
}

function getImportWorker() {
  if (!importWorker) {
    importWorker = new Worker(new URL('../workers/import-worker.js', import.meta.url), { type: 'module' });
  }
  return importWorker;
}

async function importBaseInWorker(text) {
  const activeWorker = getImportWorker();

  return new Promise((resolve, reject) => {
    activeWorker.onmessage = event => {
      const message = event.data;

      if (message?.type === 'progress') {
        setProgress(message.percent, message.label, message.detail);
        return;
      }

      if (message?.type === 'done') {
        resolve(message.collection);
        return;
      }

      if (message?.type === 'error') {
        reject(new Error(message.message || 'Erreur pendant l import.'));
      }
    };

    activeWorker.onerror = event => {
      reject(new Error(formatError(event)));
    };

    activeWorker.postMessage({ type: 'import-dataprofils', text });
  });
}

async function importBaseFromFile(file) {
  if (!file) return;

  show('analysis');
  resetProgress('Import de la base profils');

  try {
    setProgress(5, 'Lecture du fichier', `Fichier : ${file.name}`);
    const text = await file.text();

    setProgress(20, 'Demarrage de l import', 'Traitement dans un worker');
    collection = await importBaseInWorker(text);

    setProgress(92, 'Enregistrement local', 'Stockage IndexedDB');
    await saveCollection(collection);

    setProgress(100, 'Import termine', `${collection.profiles.length} profils valides`, 'done');
    baseStatus.textContent = `Base chargee : ${collection.profiles.length} profils`;
    setTimeout(() => show('home'), 500);
  } catch (error) {
    showError(error);
  }
}

function getAnalysisWorker() {
  if (!analysisWorker) {
    analysisWorker = new Worker(new URL('../workers/analysis-worker.js', import.meta.url), { type: 'module' });
  }
  return analysisWorker;
}

async function analyzeImage(imageBitmap) {
  show('analysis');
  resetProgress('Analyse de l image');
  setProgress(10, 'Preparation de l image', 'Image chargee');

  const settings = getDebugSettings();
  const activeWorker = getAnalysisWorker();
  const result = await new Promise((resolve, reject) => {
    activeWorker.onmessage = event => {
      if (event.data?.type === 'progress') {
        setProgress(event.data.percent, event.data.label, event.data.detail);
        return;
      }
      resolve(event.data);
    };
    activeWorker.onerror = event => reject(new Error(formatError(event)));
    activeWorker.postMessage({ type: 'analyze', imageBitmap, collection, settings }, [imageBitmap]);
  });

  setProgress(100, 'Resultat pret', 'Affichage des detections', 'done');
  renderResults(result);
  show('result');
}

profileDbInput.addEventListener('change', event => importBaseFromFile(event.target.files[0]));
replaceProfileDbInput.addEventListener('change', event => importBaseFromFile(event.target.files[0]));
imageInput.addEventListener('change', async event => {
  const imageBitmap = await loadImageFile(event.target.files[0]);
  await analyzeImage(imageBitmap);
});

cameraButton.addEventListener('click', async () => {
  show('camera');
  await startCamera(video);
});

captureButton.addEventListener('click', async () => {
  const imageBitmap = await captureFrame(video);
  stopCamera(video);
  await analyzeImage(imageBitmap);
});

cancelCameraButton.addEventListener('click', () => {
  stopCamera(video);
  show('home');
});

newAnalysisButton.addEventListener('click', () => show('home'));

boot();
