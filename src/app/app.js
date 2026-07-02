import { startCamera, stopCamera, captureFrame } from './camera.js';
import { loadImageFile } from './image-import.js';
import { renderResults } from './render-results.js';
import { importDataprofilsText } from '../import/dataprofils-importer.js';
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

let collection = null;
let worker = null;

function show(name) {
  Object.values(screens).forEach(screen => screen.classList.add('hidden'));
  screens[name].classList.remove('hidden');
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

async function importBaseFromFile(file) {
  if (!file) return;
  show('analysis');
  document.querySelector('#analysisStatus').textContent = 'Import de la base profils';
  const text = await file.text();
  collection = await importDataprofilsText(text);
  await saveCollection(collection);
  baseStatus.textContent = `Base chargee : ${collection.profiles.length} profils`;
  show('home');
}

function getWorker() {
  if (!worker) worker = new Worker('../workers/analysis-worker.js', { type: 'module' });
  return worker;
}

async function analyzeImage(imageBitmap) {
  show('analysis');
  document.querySelector('#analysisStatus').textContent = 'Analyse de l image';
  const activeWorker = getWorker();
  const result = await new Promise((resolve, reject) => {
    activeWorker.onmessage = event => resolve(event.data);
    activeWorker.onerror = reject;
    activeWorker.postMessage({ type: 'analyze', imageBitmap, collection }, [imageBitmap]);
  });
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
