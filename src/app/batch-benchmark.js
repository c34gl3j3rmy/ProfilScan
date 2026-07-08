import { loadImageFile } from './image-import.js';
import { isSvgFile, renderSvgFileToBitmap } from './svg-rasterizer.js';
import { computeAutoImageSettings, applyAutoImageSettings } from './auto-settings.js';
import { buildSettings } from './settings-reader.js';
import { getCollection } from '../storage/indexed-db.js';
import { buildWeightPresetBenchmark } from './benchmark-weight-presets.js';

const benchmarkInput = document.querySelector('#benchmarkInput');
const baseStatus = document.querySelector('#baseStatus');
const expectedProfileInput = document.querySelector('#expectedProfileInput');
const analysisStatus = document.querySelector('#analysisStatus');
const analysisProgress = document.querySelector('#analysisProgress');
const analysisPercent = document.querySelector('#analysisPercent');
const analysisDetails = document.querySelector('#analysisDetails');

const inputs = {
  brightness: document.querySelector('#brightnessInput'),
  contrast: document.querySelector('#contrastInput'),
  edgeQuantile: document.querySelector('#edgeQuantileInput'),
  linkRadius: document.querySelector('#linkRadiusInput'),
  minArea: document.querySelector('#minAreaInput'),
  mergeGap: document.querySelector('#mergeGapInput'),
  weightRatio: document.querySelector('#weightRatioInput'),
  weightRadial: document.querySelector('#weightRadialInput'),
  weightHu: document.querySelector('#weightHuInput'),
  weightFourier: document.querySelector('#weightFourierInput'),
  weightAngle: document.querySelector('#weightAngleInput'),
  weightFill: document.querySelector('#weightFillInput')
};

const ALGORITHM_KEYS = ['globalStage', 'localStage', 'baseStage', 'ratio', 'radial', 'hu', 'fourier', 'angle', 'fill', 'minutiae', 'localFeature', 'advanced', 'advancedRaw', 'ratioGate', 'localGate', 'hausdorff', 'shapeContext', 'icp', 'ransac', 'zernike'];
let worker = null;

benchmarkInput?.addEventListener('change', event => runBenchmark(event.target.files));

async function runBenchmark(fileList) {
  const files = Array.from(fileList || []).filter(isBenchmarkFile);
  benchmarkInput.value = '';
  if (!files.length) return;

  const collection = await getCollection();
  if (!collection?.profiles?.length) {
    setBenchmarkStatus('Benchmark impossible : base profils absente.');
    return;
  }

  showAnalysisScreen();
  resetProgress('Benchmark lot');
  const startedAt = new Date().toISOString();
  const results = [];
  const errors = [];

  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    const expectedReference = referenceFromFilename(file.name);
    setProgress(Math.round(index / files.length * 100), 'Benchmark lot', String(index + 1) + '/' + files.length + ' - ' + file.name + ' - attendu ' + expectedReference);
    try {
      const settings = buildSettings(inputs);
      if (expectedProfileInput) expectedProfileInput.value = expectedReference;
      const result = isSvgFile(file)
        ? await analyzeSvgBenchmarkFile(file, expectedReference, settings, collection)
        : await analyzeRasterBenchmarkFile(file, expectedReference, settings, collection);
      results.push(result);
      setProgress(Math.round((index + 1) / files.length * 100), result.success ? 'Profil correct' : 'Profil incorrect', file.name + ' -> ' + (result.bestReference || 'aucun') + ' (' + Math.round(result.bestScore || 0) + '%)');
    } catch (error) {
      errors.push({ fileName: file.name, expectedReference, message: formatError(error) });
      setProgress(Math.round((index + 1) / files.length * 100), 'Erreur image', file.name + ' - ' + formatError(error), 'error');
    }
  }

  const report = buildBenchmarkReport({ startedAt, files, results, errors, collection });
  saveJsonFile(report, 'profilscan-benchmark-' + timestampForFile() + '.json');
  const bestPreset = report.weightPresetBenchmark && report.weightPresetBenchmark[0];
  const bestText = bestPreset ? ' - meilleur preset ' + bestPreset.name + ' : ' + bestPreset.top1Accuracy + '% Top 1' : '';
  setProgress(100, 'Benchmark termine', results.length + ' images analysees - ' + report.summary.top1Accuracy + '% Top 1 - ' + report.summary.top3Accuracy + '% Top 3' + bestText + ' - rapport genere', 'done');
  setBenchmarkStatus('Benchmark termine : ' + report.summary.top1Accuracy + '% Top 1 - meilleur preset ' + (bestPreset?.top1Accuracy ?? '-') + '%');
}

async function analyzeRasterBenchmarkFile(file, expectedReference, settings, collection) {
  const imageBitmap = await loadImageFile(file);
  return analyzeBitmapBenchmarkImage(file, expectedReference, imageBitmap, settings, collection, null);
}

async function analyzeSvgBenchmarkFile(file, expectedReference, settings, collection) {
  const imageBitmap = await renderSvgFileToBitmap(file);
  const svgInfo = { mode: 'svg-rasterized-before-analysis', rasterizedWidth: imageBitmap.width, rasterizedHeight: imageBitmap.height };
  return analyzeBitmapBenchmarkImage(file, expectedReference, imageBitmap, settings, collection, svgInfo);
}

async function analyzeBitmapBenchmarkImage(file, expectedReference, imageBitmap, settings, collection, sourceInfo) {
  const autoSettings = await computeAutoImageSettings(imageBitmap);
  applyAutoImageSettings(inputs, autoSettings);
  const activeSettings = buildSettings(inputs);
  const analysis = await analyzeBitmap(imageBitmap, collection, activeSettings);
  const mergedAutoSettings = sourceInfo ? { ...autoSettings, source: sourceInfo } : autoSettings;
  return summarizeImageResult(file, expectedReference, mergedAutoSettings, activeSettings, analysis, collection);
}

function isBenchmarkFile(file) {
  return isSvgFile(file) || /^image\//.test(file.type) || /\.(jpg|jpeg|png|webp|bmp)$/i.test(file.name);
}

function getWorker() {
  if (!worker) worker = new Worker(new URL('../workers/analysis-worker.js', import.meta.url), { type: 'module' });
  return worker;
}

function analyzeBitmap(imageBitmap, collection, settings) {
  return new Promise((resolve, reject) => {
    const activeWorker = getWorker();
    activeWorker.onmessage = event => {
      const message = event.data;
      if (message?.type === 'error') reject(new Error(message.message || 'Erreur worker'));
      else if (message?.type !== 'progress') resolve(message);
    };
    activeWorker.onerror = event => reject(new Error(formatError(event)));
    activeWorker.postMessage({ type: 'analyze', imageBitmap, collection, settings }, [imageBitmap]);
  });
}

function summarizeImageResult(file, expectedReference, autoSettings, settings, analysis, collection) {
  const best = analysis.items?.[0] || null;
  const expectedProfile = findProfile(collection, expectedReference);
  const expectedCandidate = findExpectedCandidate(analysis, expectedReference);
  const topCandidates = (best?.topCandidates || []).slice(0, 10).map((candidate, index) => ({
    rank: index + 1,
    reference: candidate.reference,
    designation: candidate.designation,
    score: round(candidate.score),
    scoreDetails: candidate.scoreDetails
  }));
  const expectedRank = topCandidates.find(candidate => sameReference(candidate.reference, expectedReference))?.rank || null;
  const success = sameReference(best?.reference, expectedReference);

  return {
    fileName: file.name,
    expectedReference,
    expectedKnownInBase: Boolean(expectedProfile),
    success,
    top3: Boolean(expectedRank && expectedRank <= 3),
    top10: Boolean(expectedRank && expectedRank <= 10),
    expectedRank,
    bestReference: best?.reference || null,
    bestDesignation: best?.designation || null,
    bestScore: round(best?.score),
    detectedItems: analysis.items?.length || 0,
    contours: analysis.debug?.contours?.length || 0,
    holes: (analysis.debug?.contours || []).reduce((sum, contour) => sum + (contour.holes?.length || 0), 0),
    segmentationMode: analysis.debug?.segmentationMode || null,
    segmentation: analysis.debug?.segmentation || null,
    autoSettings,
    settings,
    bestScoreDetails: best?.scoreDetails || null,
    expectedCandidate: expectedCandidate ? {
      reference: expectedCandidate.reference,
      designation: expectedCandidate.designation,
      score: round(expectedCandidate.score),
      rank: expectedCandidate.rank,
      scoreDetails: expectedCandidate.scoreDetails
    } : null,
    algorithmAudit: buildAlgorithmAudit(best, expectedCandidate),
    topCandidates
  };
}

function buildBenchmarkReport({ startedAt, files, results, errors, collection }) {
  return {
    type: 'ProfilScan batch benchmark report',
    version: 'batch-benchmark-v5',
    startedAt,
    completedAt: new Date().toISOString(),
    input: { mode: 'multi-image-files', files: files.length, expectedReferenceRule: 'nom exact du fichier sans extension', svgMode: 'shared-rasterizer-before-analysis' },
    base: { name: collection?.name, profiles: collection?.profiles?.length, importedAt: collection?.importedAt, pipelineSettings: collection?.pipelineSettings },
    summary: summarizeBenchmark(results, errors),
    failureSummary: summarizeFailures(results),
    algorithmStats: summarizeAlgorithms(results),
    weightPresetBenchmark: buildWeightPresetBenchmark(results),
    confusionMatrix: buildConfusionMatrix(results),
    confusionFamilies: buildConfusionFamilies(results),
    errors,
    results
  };
}

function summarizeBenchmark(results, errors) {
  const total = results.length;
  const known = results.filter(item => item.expectedKnownInBase).length;
  const success = results.filter(item => item.success).length;
  const top3 = results.filter(item => item.top3).length;
  const top10 = results.filter(item => item.top10).length;
  return {
    total,
    knownExpected: known,
    errors: errors.length,
    successTop1: success,
    successTop3: top3,
    successTop10: top10,
    top1Accuracy: percent(success, total),
    top3Accuracy: percent(top3, total),
    top10Accuracy: percent(top10, total),
    knownTop1Accuracy: percent(success, known),
    knownTop3Accuracy: percent(top3, known),
    knownTop10Accuracy: percent(top10, known),
    noDetection: results.filter(item => !item.detectedItems).length,
    unknownExpected: results.filter(item => !item.expectedKnownInBase).length,
    failedTop1: total - success
  };
}

function summarizeFailures(results) {
  const failed = results.filter(result => result.expectedKnownInBase && !result.success);
  return {
    outsideTop10: failed.filter(result => !result.top10).map(summarizeFailedProfile),
    outsideTop3: failed.filter(result => !result.top3).map(summarizeFailedProfile),
    top3ButNotTop1: failed.filter(result => result.top3).map(summarizeFailedProfile)
  };
}

function summarizeFailedProfile(result) {
  return {
    fileName: result.fileName,
    expectedReference: result.expectedReference,
    bestReference: result.bestReference,
    expectedRank: result.expectedRank,
    bestScore: result.bestScore,
    expectedScore: result.expectedCandidate?.score ?? null,
    expectedWins: result.algorithmAudit?.expectedWins || [],
    bestWins: result.algorithmAudit?.bestWins || []
  };
}

function summarizeAlgorithms(results) {
  return ALGORITHM_KEYS.map(key => {
    const rows = results.map(result => result.algorithmAudit?.rows?.find(row => row.key === key)).filter(Boolean);
    const usableRows = rows.filter(row => Number.isFinite(row.delta));
    const expectedWins = usableRows.filter(row => row.delta > 0).length;
    const bestWins = usableRows.filter(row => row.delta < 0).length;
    return { key, samples: usableRows.length, expectedWins, bestWins, neutral: usableRows.filter(row => row.delta === 0).length, averageDelta: average(usableRows.map(row => row.delta)), reliabilityHint: expectedWins - bestWins };
  }).sort((a, b) => b.reliabilityHint - a.reliabilityHint);
}

function buildConfusionMatrix(results) {
  const map = new Map();
  for (const result of results) {
    if (result.success || !result.expectedReference || !result.bestReference) continue;
    const key = result.expectedReference + ' -> ' + result.bestReference;
    const current = map.get(key) || { expectedReference: result.expectedReference, bestReference: result.bestReference, count: 0, files: [] };
    current.count++;
    current.files.push(result.fileName);
    map.set(key, current);
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

function buildConfusionFamilies(results) {
  const map = new Map();
  for (const result of results) {
    if (result.success || !result.expectedReference || !result.bestReference) continue;
    const expectedFamily = familyKey(result.expectedReference);
    const bestFamily = familyKey(result.bestReference);
    const key = expectedFamily + ' -> ' + bestFamily;
    const current = map.get(key) || { expectedFamily, bestFamily, count: 0, examples: [] };
    current.count++;
    current.examples.push({ expectedReference: result.expectedReference, bestReference: result.bestReference, fileName: result.fileName });
    map.set(key, current);
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

function familyKey(reference) {
  const value = String(reference || '').toUpperCase();
  return value.match(/^[A-Z]+\d{0,2}/)?.[0] || value.match(/^\d{2,3}/)?.[0] || value.slice(0, 3);
}

function buildAlgorithmAudit(best, expectedCandidate) {
  const rows = ALGORITHM_KEYS.map(key => {
    const bestScore = scoreValue(best, key);
    const expectedScore = scoreValue(expectedCandidate, key);
    const delta = Number.isFinite(expectedScore) && Number.isFinite(bestScore) ? round(expectedScore - bestScore) : null;
    return { key, bestScore, expectedScore, delta, verdict: algorithmVerdict(delta) };
  });
  return { expectedFound: Boolean(expectedCandidate), rows, expectedWins: rows.filter(row => Number(row.delta) > 0).map(row => row.key), bestWins: rows.filter(row => Number(row.delta) < 0).map(row => row.key) };
}

function findExpectedCandidate(analysis, expectedReference) {
  for (const [itemIndex, item] of (analysis.items || []).entries()) {
    const candidateIndex = item.topCandidates?.findIndex(candidate => sameReference(candidate.reference, expectedReference)) ?? -1;
    if (candidateIndex >= 0) return { ...item.topCandidates[candidateIndex], itemIndex, rank: candidateIndex + 1 };
  }
  return null;
}

function findProfile(collection, reference) {
  return collection?.profiles?.find(profile => sameReference(profile.reference, reference)) || null;
}

function scoreValue(candidate, key) {
  const value = candidate?.scoreDetails?.subscores?.[key];
  return round(value);
}

function algorithmVerdict(delta) {
  if (!Number.isFinite(delta)) return 'unknown';
  if (delta >= 8) return 'strong-for-expected';
  if (delta > 0) return 'for-expected';
  if (delta <= -8) return 'strong-for-best';
  if (delta < 0) return 'for-best';
  return 'neutral';
}

function referenceFromFilename(fileName) {
  const dot = fileName.lastIndexOf('.');
  return (dot > 0 ? fileName.slice(0, dot) : fileName).trim().replace(/\.min$/i, '');
}

function sameReference(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

function average(values) {
  const clean = values.filter(Number.isFinite);
  if (!clean.length) return null;
  return round(clean.reduce((sum, value) => sum + value, 0) / clean.length);
}

function percent(value, total) {
  return total > 0 ? round((value / total) * 100) : 0;
}

function round(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
}

function saveJsonFile(data, fileName) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', objectUrl);
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

function timestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function showAnalysisScreen() {
  document.querySelectorAll('.app-shell > section').forEach(section => section.classList.add('hidden'));
  document.querySelector('#screenAnalysis')?.classList.remove('hidden');
}

function resetProgress(label) {
  if (analysisProgress) analysisProgress.value = 0;
  if (analysisPercent) analysisPercent.textContent = '0 %';
  if (analysisStatus) analysisStatus.textContent = label;
  if (analysisDetails) analysisDetails.innerHTML = '';
}

function setProgress(percent, label, detail, className = '') {
  const safePercent = Math.max(0, Math.min(100, Math.round(percent)));
  if (analysisProgress) analysisProgress.value = safePercent;
  if (analysisPercent) analysisPercent.textContent = safePercent + ' %';
  if (analysisStatus) analysisStatus.textContent = label;
  if (!analysisDetails || !detail) return;
  const item = document.createElement('li');
  item.textContent = detail;
  if (className) item.classList.add(className);
  analysisDetails.appendChild(item);
  analysisDetails.scrollTop = analysisDetails.scrollHeight;
}

function setBenchmarkStatus(message) {
  if (baseStatus) baseStatus.textContent = message;
}

function formatError(error) {
  if (error instanceof Error && error.message) return error.message;
  if (error?.message) return String(error.message);
  if (error?.filename) return error.filename + ':' + (error.lineno || '?') + ' - ' + (error.message || 'Erreur script');
  if (error?.type) return 'Evenement ' + error.type;
  return String(error);
}
