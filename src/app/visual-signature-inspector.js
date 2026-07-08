import { loadImageFile } from './image-import.js';
import { computeAutoImageSettings } from './auto-settings.js';
import { getCollection } from '../storage/indexed-db.js';

const fileInput = document.querySelector('#fileInput');
const referenceInput = document.querySelector('#referenceInput');
let worker = null;

const nodes = createSignatureSection();

nodes.button.addEventListener('click', runSignatureInspection);
fileInput?.addEventListener('change', () => {
  nodes.status.textContent = 'Prêt pour l inspection des signatures.';
});

async function runSignatureInspection() {
  const file = fileInput?.files?.[0];
  if (!file) {
    setStatus('Sélectionne d abord un SVG ou une image.', true);
    return;
  }

  nodes.button.disabled = true;
  setStatus('Chargement de la base locale...');

  try {
    const collection = await getCollection();
    if (!collection?.profiles?.length) throw new Error('Base locale absente. Importe d abord dataprofils.json dans ProfilScan.');

    const expectedReference = (referenceInput.value || referenceFromFilename(file.name)).trim();
    const expectedProfile = collection.profiles.find(profile => sameReference(profile.reference, expectedReference));
    if (!expectedProfile) throw new Error('Référence attendue introuvable : ' + expectedReference);

    setStatus('Rasterisation et réglages automatiques...');
    const imageBitmap = await loadImageFile(file);
    const auto = await computeAutoImageSettings(imageBitmap);
    const settings = buildWorkerSettings(auto, collection, expectedReference);

    setStatus('Analyse avec le worker principal...');
    const analysis = await analyzeWithWorker(imageBitmap, collection, settings);
    const report = buildSignatureReport(analysis, expectedProfile, expectedReference);

    renderReport(report);
    setStatus('Inspection des signatures terminée.', report.expectedRank !== 1);
  } catch (error) {
    setStatus(formatError(error), true);
  } finally {
    nodes.button.disabled = false;
  }
}

function buildWorkerSettings(auto, collection, expectedReference) {
  return {
    expectedReference,
    image: {
      brightness: auto.brightness,
      contrast: auto.contrast,
      blurRadius: 1,
      textureSuppression: 0
    },
    detection: {
      edgeQuantile: auto.edgeQuantile / 100,
      linkRadius: auto.linkRadius,
      minAreaRatio: auto.minArea / 10000,
      mergeGapRatio: auto.mergeGap / 1000
    },
    pipelineSettings: collection.pipelineSettings || null
  };
}

function analyzeWithWorker(imageBitmap, collection, settings) {
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
    activeWorker.onerror = event => reject(new Error(event.message || 'Erreur worker'));
    activeWorker.postMessage({ type: 'analyze', imageBitmap, collection, settings }, [imageBitmap]);
  });
}

function getWorker() {
  if (!worker) worker = new Worker(new URL('../workers/analysis-worker.js', import.meta.url), { type: 'module' });
  return worker;
}

function buildSignatureReport(analysis, expectedProfile, expectedReference) {
  const firstItem = analysis.items?.[0] || null;
  const topCandidates = firstItem?.topCandidates || [];
  const expectedIndex = topCandidates.findIndex(candidate => sameReference(candidate.reference, expectedReference));
  const expectedCandidate = expectedIndex >= 0 ? topCandidates[expectedIndex] : null;
  const bestCandidate = topCandidates[0] || null;
  const algorithms = ['ratio', 'radial', 'hu', 'fourier', 'angle', 'fill', 'minutiae', 'localFeature', 'advanced', 'advancedRaw', 'ratioGate', 'localGate', 'hausdorff', 'shapeContext', 'icp', 'ransac', 'zernike'];
  const comparisonRows = algorithms.map(key => ({
    key,
    bestScore: subscore(bestCandidate, key),
    expectedScore: subscore(expectedCandidate, key),
    deltaExpectedMinusBest: delta(subscore(expectedCandidate, key), subscore(bestCandidate, key)),
    verdict: verdict(delta(subscore(expectedCandidate, key), subscore(bestCandidate, key)))
  }));

  return {
    expectedReference,
    bestReference: firstItem?.reference || null,
    bestScore: round(firstItem?.score),
    expectedRank: expectedIndex >= 0 ? expectedIndex + 1 : null,
    expectedScore: round(expectedCandidate?.score),
    detectedItems: analysis.items?.length || 0,
    segmentationMode: analysis.debug?.segmentationMode || null,
    contours: analysis.debug?.contours?.length || 0,
    storedSignature: summarizeStoredSignature(expectedProfile),
    topCandidates: topCandidates.slice(0, 10).map((candidate, index) => ({
      rank: index + 1,
      reference: candidate.reference,
      designation: candidate.designation,
      score: round(candidate.score)
    })),
    comparisonRows,
    diagnosis: diagnose({ expectedIndex, firstItem, expectedReference, comparisonRows, analysis })
  };
}

function diagnose(report) {
  if (!report.analysis?.items?.length) return 'Aucune section détectée : problème avant signature/matching.';
  if (report.expectedIndex < 0) return 'Le profil attendu est absent du Top10 : problème probable de candidate-search ou de signature trop différente.';
  if (report.expectedIndex === 0) return 'Le profil attendu est Top1 : le pipeline reconnaît correctement cette image.';
  const harmful = report.comparisonRows.filter(row => Number(row.deltaExpectedMinusBest) < -5).map(row => row.key);
  if (harmful.length) return 'Le bon profil est présent mais pénalisé par : ' + harmful.join(', ') + '.';
  return 'Le bon profil est présent mais la fusion des scores favorise un autre candidat.';
}

function renderReport(report) {
  renderSummary(report);
  renderTopCandidates(report.topCandidates);
  renderAlgorithmRows(report.comparisonRows);
  renderStoredSignature(report.storedSignature);
}

function renderSummary(report) {
  nodes.summary.innerHTML = '';
  const rows = {
    diagnostic: report.diagnosis,
    expectedReference: report.expectedReference,
    bestReference: report.bestReference || 'aucun',
    bestScore: report.bestScore ?? '-',
    expectedRank: report.expectedRank || 'absent Top10',
    expectedScore: report.expectedScore ?? '-',
    detectedItems: report.detectedItems,
    segmentationMode: report.segmentationMode || '-',
    contours: report.contours
  };
  for (const [key, value] of Object.entries(rows)) addRow(nodes.summary, key, value);
}

function renderTopCandidates(candidates) {
  nodes.top.innerHTML = '<tr><th>Rang</th><th>Référence</th><th>Score</th><th>Désignation</th></tr>';
  for (const candidate of candidates) {
    const row = document.createElement('tr');
    row.innerHTML = '<td>' + candidate.rank + '</td><td>' + text(candidate.reference) + '</td><td>' + text(candidate.score) + '</td><td>' + text(candidate.designation || '') + '</td>';
    nodes.top.appendChild(row);
  }
}

function renderAlgorithmRows(rows) {
  nodes.algorithms.innerHTML = '<tr><th>Algo</th><th>Top1</th><th>Attendu</th><th>Delta attendu - Top1</th><th>Verdict</th></tr>';
  for (const item of rows) {
    const row = document.createElement('tr');
    const cls = item.verdict === 'pénalise attendu' ? 'warn' : item.verdict === 'favorise attendu' ? 'ok' : '';
    row.innerHTML = '<td>' + item.key + '</td><td>' + text(item.bestScore) + '</td><td>' + text(item.expectedScore) + '</td><td>' + text(item.deltaExpectedMinusBest) + '</td><td class="' + cls + '">' + item.verdict + '</td>';
    nodes.algorithms.appendChild(row);
  }
}

function renderStoredSignature(signature) {
  nodes.signature.innerHTML = '';
  for (const [key, value] of Object.entries(signature)) addRow(nodes.signature, key, typeof value === 'object' ? JSON.stringify(value) : value);
}

function createSignatureSection() {
  const main = document.querySelector('main');
  const section = document.createElement('section');
  section.className = 'card panel';
  section.innerHTML = `
    <h2>5. Inspecteur des signatures et sous-scores</h2>
    <p>Analyse l'image uploadée avec le worker principal, puis compare les sous-scores du Top1 avec ceux du profil attendu.</p>
    <div class="controls">
      <button id="signatureInspectButton" type="button">Inspecter les signatures</button>
      <div id="signatureStatus" class="status">Prêt pour l inspection des signatures.</div>
    </div>
    <div class="pipeline-grid">
      <article class="panel"><h3>Résumé matching</h3><table id="signatureSummary"></table></article>
      <article class="panel"><h3>Signature stockée attendue</h3><table id="storedSignature"></table></article>
    </div>
    <article class="panel"><h3>Top 10 worker</h3><table id="signatureTopCandidates"></table></article>
    <article class="panel"><h3>Sous-scores : Top1 vs attendu</h3><table id="signatureAlgorithms"></table></article>
  `;
  main?.appendChild(section);
  return {
    button: section.querySelector('#signatureInspectButton'),
    status: section.querySelector('#signatureStatus'),
    summary: section.querySelector('#signatureSummary'),
    signature: section.querySelector('#storedSignature'),
    top: section.querySelector('#signatureTopCandidates'),
    algorithms: section.querySelector('#signatureAlgorithms')
  };
}

function summarizeStoredSignature(profile) {
  const fingerprint = profile.fingerprint || profile.dna || {};
  const descriptors = fingerprint.descriptors || profile.dna?.descriptors || {};
  const minutiae = descriptors.minutiae || fingerprint.subsignatures?.minutiae || {};
  const localFeature = descriptors.localFeature || fingerprint.subsignatures?.localFeature || {};
  return {
    pipelineMode: fingerprint.summary?.pipelineMode || null,
    sourceKind: fingerprint.summary?.sourceKind || null,
    pointCount: fingerprint.summary?.pointCount || null,
    fillRatio: round(fingerprint.summary?.fillRatio),
    radialBins: Array.isArray(descriptors.radial) ? descriptors.radial.length : null,
    fourierTerms: Array.isArray(descriptors.fourier) ? descriptors.fourier.length : null,
    angleBins: Array.isArray(descriptors.angleHistogram) ? descriptors.angleHistogram.length : null,
    minutiaeCounts: minutiae.counts || null,
    localFeatures: localFeature.features || null
  };
}

function subscore(candidate, key) {
  return round(candidate?.scoreDetails?.subscores?.[key]);
}

function verdict(value) {
  if (!Number.isFinite(Number(value))) return 'non calculé';
  if (value > 5) return 'favorise attendu';
  if (value < -5) return 'pénalise attendu';
  return 'neutre';
}

function addRow(table, key, value) {
  const row = document.createElement('tr');
  const th = document.createElement('th');
  const td = document.createElement('td');
  th.textContent = key;
  td.textContent = String(value ?? '-');
  row.append(th, td);
  table.appendChild(row);
}

function setStatus(message, warning = false) {
  nodes.status.textContent = message;
  nodes.status.className = 'status ' + (warning ? 'warn' : 'ok');
}

function referenceFromFilename(fileName) {
  const dot = fileName.lastIndexOf('.');
  return (dot > 0 ? fileName.slice(0, dot) : fileName).trim().replace(/\.min$/i, '');
}

function sameReference(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

function delta(a, b) {
  const first = Number(a);
  const second = Number(b);
  return Number.isFinite(first) && Number.isFinite(second) ? round(first - second) : null;
}

function round(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
}

function text(value) {
  return String(value ?? '-').replace(/[<>&]/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[char]));
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}
