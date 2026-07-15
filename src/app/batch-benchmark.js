import { loadImageFile } from './image-import.js';
import { isSvgFile, renderSvgFileToBitmap } from './svg-rasterizer.js';
import { computeAutoImageSettings, applyAutoImageSettings } from './auto-settings.js';
import { buildSettings } from './settings-reader.js';
import { getCollection } from '../storage/indexed-db.js';
import {
  buildAlgorithmAudit,
  buildAlgorithmRanks,
  buildAlgorithmVotes
} from './benchmark/benchmark-algorithms.js';
import {
  buildCandidateSearchDiagnostics,
  buildDetectionDiagnostics,
  buildFailureAnalysis,
  buildGeometryDiagnostics,
  findProfile,
  summarizeSegmentation
} from './benchmark/benchmark-diagnostics.js';
import {
  buildBenchmarkReport,
  summarizeCandidates
} from './benchmark/benchmark-report.js';
import {
  resetProgress,
  setBenchmarkStatus,
  setProgress,
  showAnalysisScreen
} from './benchmark/benchmark-ui.js';
import {
  formatError,
  isBenchmarkFile,
  referenceFromFilename,
  round,
  sameReference,
  saveJsonFile,
  timestampForFile
} from './benchmark/benchmark-utils.js';

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


let worker = null;

benchmarkInput?.addEventListener('change', event => runBenchmark(event.target.files));

async function runBenchmark(fileList) {
  const files = Array.from(fileList || []).filter(isBenchmarkFile);
  if (benchmarkInput) benchmarkInput.value = '';
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

    if (expectedProfileInput) expectedProfileInput.value = expectedReference;

    setProgress(
      Math.round(index / files.length * 100),
      'Benchmark lot',
      `${index + 1}/${files.length} - ${file.name} - attendu ${expectedReference}`
    );

    try {
      const result = isSvgFile(file)
        ? await analyzeSvgBenchmarkFile(file, expectedReference, collection)
        : await analyzeRasterBenchmarkFile(file, expectedReference, collection);

      results.push(result);
      setProgress(
        Math.round((index + 1) / files.length * 100),
        result.success ? 'Profil correct' : 'Profil incorrect',
        `${file.name} -> ${result.bestReference || 'aucun'} (${Math.round(result.bestScore || 0)} %) · attendu rang ${result.expectedRank ?? '-'}`
      );
    } catch (error) {
      errors.push({ fileName: file.name, expectedReference, message: formatError(error) });
      setProgress(
        Math.round((index + 1) / files.length * 100),
        'Erreur image',
        `${file.name} - ${formatError(error)}`,
        'error'
      );
    }
  }

  const report = buildBenchmarkReport({ startedAt, files, results, errors, collection });
  saveJsonFile(report, `profilscan-benchmark-summary-${timestampForFile()}.json`);

  const bestPreset = report.weightPresetBenchmark?.[0];
  const bestPresetText = bestPreset
    ? ` · meilleur preset ${bestPreset.name}: ${bestPreset.top1Accuracy} % Top 1`
    : '';

  setProgress(
    100,
    'Benchmark termine',
    `${results.length} images analysees · ${report.summary.top1Accuracy} % Top 1 · ${report.summary.top3Accuracy} % Top 3${bestPresetText}`,
    'done'
  );
  setBenchmarkStatus(`Benchmark termine : ${report.summary.top1Accuracy} % Top 1`);
}

async function analyzeRasterBenchmarkFile(file, expectedReference, collection) {
  const imageBitmap = await loadImageFile(file);
  return analyzeBitmapBenchmarkImage(file, expectedReference, imageBitmap, collection, null);
}

async function analyzeSvgBenchmarkFile(file, expectedReference, collection) {
  const imageBitmap = await renderSvgFileToBitmap(file);
  return analyzeBitmapBenchmarkImage(file, expectedReference, imageBitmap, collection, {
    mode: 'svg-rasterized-before-analysis',
    rasterizedWidth: imageBitmap.width,
    rasterizedHeight: imageBitmap.height
  });
}

async function analyzeBitmapBenchmarkImage(file, expectedReference, imageBitmap, collection, sourceInfo) {
  const autoSettings = await computeAutoImageSettings(imageBitmap);
  applyAutoImageSettings(inputs, autoSettings);

  const settings = buildSettings(inputs);
  settings.expectedReference = expectedReference;

  const analysis = await analyzeBitmap(imageBitmap, collection, settings);
  const mergedAutoSettings = sourceInfo ? { ...autoSettings, source: sourceInfo } : autoSettings;
  return summarizeImageResult(file, expectedReference, mergedAutoSettings, settings, analysis, collection);
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

function getWorker() {
  if (!worker) worker = new Worker(new URL('../workers/analysis-worker.js', import.meta.url), { type: 'module' });
  return worker;
}

function summarizeImageResult(file, expectedReference, autoSettings, settings, analysis, collection) {
  const best = analysis.items?.[0] || null;
  const fullCandidates = (best?.topCandidates || []).map((candidate, index) => ({
    rank: index + 1,
    reference: candidate.reference,
    designation: candidate.designation,
    score: round(candidate.score),
    scoreDetails: candidate.scoreDetails
  }));

  const expectedCandidate = fullCandidates.find(candidate => sameReference(candidate.reference, expectedReference)) || null;
  const expectedRank = expectedCandidate?.rank || null;
  const expectedProfile = findProfile(collection, expectedReference);
  const bestProfile = findProfile(collection, best?.reference);
  const success = expectedRank === 1;

  const algorithmAudit = buildAlgorithmAudit(best, expectedCandidate);
  const algorithmRanks = buildAlgorithmRanks(fullCandidates, expectedReference, best?.reference);
  const algorithmVotes = buildAlgorithmVotes(algorithmRanks, expectedReference, best?.reference);

  const result = {
    fileName: file.name,
    expectedReference,
    expectedKnownInBase: Boolean(expectedProfile),
    success,
    top3: Boolean(expectedRank && expectedRank <= 3),
    top10: Boolean(expectedRank && expectedRank <= 10),
    expectedRank,
    candidateCount: fullCandidates.length,
    bestReference: best?.reference || null,
    bestDesignation: best?.designation || null,
    bestScore: round(best?.score),
    detectedItems: analysis.items?.length || 0,
    contours: analysis.debug?.contours?.length || 0,
    holes: (analysis.debug?.contours || []).reduce((sum, contour) => sum + (contour.holes?.length || 0), 0),
    segmentationMode: analysis.debug?.segmentationMode || null,
    segmentation: summarizeSegmentation(analysis.debug?.segmentation),
    detectionDiagnostics: buildDetectionDiagnostics(analysis, autoSettings),
    geometryDiagnostics: buildGeometryDiagnostics(expectedProfile, bestProfile, best, expectedCandidate),
    autoSettings,
    settings,
    expectedCandidate,
    algorithmAudit,
    algorithmRanks,
    algorithmVotes,
    topCandidates: fullCandidates,
    top10Candidates: summarizeCandidates(fullCandidates.slice(0, 10))
  };

  result.candidateSearchDiagnostics = buildCandidateSearchDiagnostics(result);
  result.failureAnalysis = buildFailureAnalysis(result);
  return result;
}

) {
  const summary = summarizeBenchmark(results, errors);
  const failures = results.filter(result => result.expectedKnownInBase && !result.success);
  const failureSummary = {
    outsideTop10: failures.filter(result => !result.top10).map(summarizeFailedProfile),
    top3ButNotTop1: failures.filter(result => result.top3).map(summarizeFailedProfile),
    rankedOutsideTop10: failures.filter(result => result.expectedRank && result.expectedRank > 10).map(summarizeFailedProfile),
    missingFromRanking: failures.filter(result => !result.expectedRank).map(summarizeFailedProfile)
  };
  const algorithmEffectiveness = summarizeAlgorithmEffectiveness(results);
  const weightPresetBenchmark = summarizeWeightPresetBenchmark(buildWeightPresetBenchmark(results));

  return {
    type: 'ProfilScan batch benchmark full-ranking report',
    version: 'batch-benchmark-full-ranking-v2',
    startedAt,
    completedAt: new Date().toISOString(),
    input: {
      mode: 'multi-image-files',
      files: files.length,
      expectedReferenceRule: 'nom exact du fichier sans extension',
      svgMode: 'shared-rasterizer-before-analysis'
    },
    base: {
      name: collection?.name,
      profiles: collection?.profiles?.length,
      importedAt: collection?.importedAt,
      pipelineSettings: collection?.pipelineSettings
    },
    summary,
    priorityFailures: buildPriorityFailures(results),
    failureSummary,
    candidateSearchDiagnostics: failures.map(result => result.candidateSearchDiagnostics),
    algorithmEffectiveness,
    algorithmVotes: summarizeGlobalAlgorithmVotes(results),
    weightPresetBenchmark,
    confusionMatrix: buildConfusionMatrix(results),
    reportForChatGPT: {
      summary,
      priorityFailures: buildPriorityFailures(results).slice(0, 12),
      algorithmsToIncrease: algorithmEffectiveness.filter(item => item.recommendation === 'increase').map(item => item.key),
      algorithmsToReduce: algorithmEffectiveness.filter(item => ['reduce', 'disable'].includes(item.recommendation)).map(item => item.key)
    },
    errors
  };
}
