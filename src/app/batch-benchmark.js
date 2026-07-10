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

const ALGORITHM_KEYS = [
  'globalStage', 'localStage', 'baseStage', 'ratio', 'radial', 'hu',
  'fourier', 'angle', 'fill', 'minutiae', 'localFeature', 'advanced',
  'advancedRaw', 'ratioGate', 'localGate', 'hausdorff', 'shapeContext',
  'icp', 'ransac', 'zernike'
];

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

function buildBenchmarkReport({ startedAt, files, results, errors, collection }) {
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

function summarizeBenchmark(results, errors) {
  const total = results.length;
  const known = results.filter(item => item.expectedKnownInBase).length;
  const top1 = results.filter(item => item.success).length;
  const top3 = results.filter(item => item.top3).length;
  const top10 = results.filter(item => item.top10).length;

  return {
    total,
    knownExpected: known,
    errors: errors.length,
    successTop1: top1,
    successTop3: top3,
    successTop10: top10,
    top1Accuracy: percent(top1, total),
    top3Accuracy: percent(top3, total),
    top10Accuracy: percent(top10, total),
    knownTop1Accuracy: percent(top1, known),
    knownTop3Accuracy: percent(top3, known),
    knownTop10Accuracy: percent(top10, known),
    noDetection: results.filter(item => !item.detectedItems).length,
    unknownExpected: results.filter(item => !item.expectedKnownInBase).length,
    failedTop1: total - top1
  };
}

function summarizeFailedProfile(result) {
  return {
    fileName: result.fileName,
    expectedReference: result.expectedReference,
    bestReference: result.bestReference,
    expectedRank: result.expectedRank,
    candidateCount: result.candidateCount,
    bestScore: result.bestScore,
    expectedScore: result.expectedCandidate?.score ?? null,
    scoreGap: round((result.bestScore ?? 0) - (result.expectedCandidate?.score ?? 0)),
    algorithmVotes: result.algorithmVotes?.counts || {},
    detectionDiagnostics: result.detectionDiagnostics,
    top10Candidates: result.top10Candidates,
    failureAnalysis: result.failureAnalysis
  };
}

function buildPriorityFailures(results) {
  return results
    .filter(result => result.expectedKnownInBase && !result.success)
    .map(result => ({
      fileName: result.fileName,
      expectedReference: result.expectedReference,
      bestReference: result.bestReference,
      severity: failureSeverity(result),
      reason: result.failureAnalysis?.dominantReason,
      expectedRank: result.expectedRank,
      candidateCount: result.candidateCount,
      bestScore: result.bestScore,
      expectedScore: result.expectedCandidate?.score ?? null,
      candidateSearchStatus: result.candidateSearchDiagnostics?.status,
      top10Candidates: result.top10Candidates
    }))
    .sort((a, b) => b.severity - a.severity);
}

function failureSeverity(result) {
  if (!result.detectedItems) return 100;
  if (!result.expectedKnownInBase) return 90;
  if (!result.expectedRank) return 85;
  if (result.expectedRank > 50) return 80;
  if (result.expectedRank > 10) return 70;
  if (result.expectedRank > 3) return 50;
  return 25;
}

function buildCandidateSearchDiagnostics(result) {
  if (!result.expectedKnownInBase) {
    return { status: 'expected-not-in-base', expectedReference: result.expectedReference };
  }
  if (!result.detectedItems) {
    return { status: 'no-detection', expectedReference: result.expectedReference };
  }
  if (!result.expectedRank) {
    return {
      status: 'expected-missing-from-full-ranking',
      expectedReference: result.expectedReference,
      inspectedCandidateLimit: result.candidateCount,
      bestReference: result.bestReference
    };
  }

  return {
    status: result.expectedRank === 1
      ? 'expected-top1'
      : result.expectedRank <= 3
        ? 'expected-in-top3'
        : result.expectedRank <= 10
          ? 'expected-in-top10'
          : 'expected-ranked-outside-top10',
    expectedReference: result.expectedReference,
    expectedRank: result.expectedRank,
    candidateCount: result.candidateCount,
    bestReference: result.bestReference,
    bestScore: result.bestScore,
    expectedScore: result.expectedCandidate?.score ?? null,
    scoreGap: round((result.bestScore ?? 0) - (result.expectedCandidate?.score ?? 0))
  };
}

function buildFailureAnalysis(result) {
  if (!result.expectedKnownInBase) return { dominantReason: 'reference-absente' };
  if (!result.detectedItems) return { dominantReason: 'no-detection' };
  if (!result.expectedRank) return { dominantReason: 'expected-missing-from-full-ranking' };

  const harmful = result.algorithmAudit?.rows
    ?.filter(row => Number(row.delta) < 0)
    .sort((a, b) => a.delta - b.delta)
    .slice(0, 6) || [];
  const helpful = result.algorithmAudit?.rows
    ?.filter(row => Number(row.delta) > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 6) || [];

  return {
    dominantReason: result.expectedRank > 10 ? 'signature-or-scoring-gap' : 'scoring-fusion-issue',
    expectedRank: result.expectedRank,
    harmfulAlgorithms: harmful,
    helpfulAlgorithms: helpful
  };
}

function summarizeAlgorithmEffectiveness(results) {
  const failed = results.filter(result => result.expectedKnownInBase && !result.success && result.expectedCandidate);

  return ALGORITHM_KEYS.map(key => {
    const rows = failed
      .map(result => result.algorithmAudit?.rows?.find(row => row.key === key))
      .filter(row => Number.isFinite(row?.delta));
    const expectedWins = rows.filter(row => row.delta > 0).length;
    const bestWins = rows.filter(row => row.delta < 0).length;
    const averageDelta = average(rows.map(row => row.delta));
    const samples = rows.length;
    const effectivenessScore = samples
      ? clamp(round(50 + ((expectedWins - bestWins) / samples) * 35 + clamp(averageDelta || 0, -25, 25) * 0.6), 0, 100)
      : null;

    return {
      key,
      samples,
      expectedWins,
      bestWins,
      neutral: rows.filter(row => row.delta === 0).length,
      averageDelta,
      effectivenessScore,
      recommendation: algorithmRecommendation(effectivenessScore, samples, expectedWins, bestWins, averageDelta)
    };
  }).sort((a, b) => (b.effectivenessScore ?? -1) - (a.effectivenessScore ?? -1));
}

function summarizeGlobalAlgorithmVotes(results) {
  return ALGORITHM_KEYS.map(key => {
    const votes = { expected: 0, currentTop1: 0, other: 0, none: 0 };
    const winners = new Map();

    for (const result of results.filter(item => item.expectedKnownInBase && !item.success)) {
      const vote = result.algorithmVotes?.perAlgorithm?.find(row => row.key === key);
      if (!vote?.winnerReference) votes.none++;
      else if (sameReference(vote.winnerReference, result.expectedReference)) votes.expected++;
      else if (sameReference(vote.winnerReference, result.bestReference)) votes.currentTop1++;
      else votes.other++;

      if (vote?.winnerReference) {
        winners.set(vote.winnerReference, (winners.get(vote.winnerReference) || 0) + 1);
      }
    }

    return {
      key,
      votes,
      topWinners: Array.from(winners.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([reference, count]) => ({ reference, count }))
    };
  });
}

function summarizeWeightPresetBenchmark(presets) {
  return (presets || []).map(preset => ({
    name: preset.name,
    category: preset.category,
    description: preset.description,
    top1Accuracy: preset.top1Accuracy,
    top3Accuracy: preset.top3Accuracy,
    top10Accuracy: preset.top10Accuracy,
    changedDecisions: preset.changedDecisions,
    baseWeights: preset.baseWeights,
    advancedWeight: preset.advancedWeight,
    advancedDetails: preset.advancedDetails,
    failureRows: (preset.rows || []).filter(row => !row.top1 || row.changedDecision).slice(0, 20)
  }));
}

function buildAlgorithmRanks(candidates, expectedReference, bestReference) {
  return ALGORITHM_KEYS.map(key => {
    const ranked = candidates
      .map(candidate => ({ reference: candidate.reference, score: scoreValue(candidate, key) }))
      .filter(candidate => Number.isFinite(candidate.score))
      .sort((a, b) => b.score - a.score);

    const expectedIndex = ranked.findIndex(candidate => sameReference(candidate.reference, expectedReference));
    const bestIndex = ranked.findIndex(candidate => sameReference(candidate.reference, bestReference));

    return {
      key,
      winnerReference: ranked[0]?.reference || null,
      expectedRank: expectedIndex >= 0 ? expectedIndex + 1 : null,
      bestRank: bestIndex >= 0 ? bestIndex + 1 : null
    };
  });
}

function buildAlgorithmVotes(algorithmRanks, expectedReference, bestReference) {
  const perAlgorithm = algorithmRanks.map(row => ({
    ...row,
    vote: !row.winnerReference
      ? 'none'
      : sameReference(row.winnerReference, expectedReference)
        ? 'expected'
        : sameReference(row.winnerReference, bestReference)
          ? 'currentTop1'
          : 'other'
  }));

  const counts = perAlgorithm.reduce((output, row) => {
    output[row.vote] = (output[row.vote] || 0) + 1;
    return output;
  }, {});

  return { counts, perAlgorithm };
}

function buildAlgorithmAudit(best, expectedCandidate) {
  const rows = ALGORITHM_KEYS.map(key => {
    const bestScore = scoreValue(best, key);
    const expectedScore = scoreValue(expectedCandidate, key);
    const delta = Number.isFinite(bestScore) && Number.isFinite(expectedScore)
      ? round(expectedScore - bestScore)
      : null;
    return { key, bestScore, expectedScore, delta };
  });

  return {
    expectedFound: Boolean(expectedCandidate),
    rows,
    expectedWins: rows.filter(row => Number(row.delta) > 0).map(row => row.key),
    bestWins: rows.filter(row => Number(row.delta) < 0).map(row => row.key)
  };
}

function buildGeometryDiagnostics(expectedProfile, bestProfile, best, expectedCandidate) {
  return {
    expected: buildProfileGeometry(expectedProfile),
    best: { ...buildProfileGeometry(bestProfile), score: round(best?.score) },
    expectedCandidate: { ...buildProfileGeometry(expectedProfile), score: round(expectedCandidate?.score) }
  };
}

function buildProfileGeometry(profile) {
  if (!profile) return {};
  const width = Number(profile.width);
  const height = Number(profile.height);
  const area = Number(profile.surface || profile.area);
  const perimeter = Number(profile.perimeter || profile.externalPerimeter || profile.totalPerimeter);
  const fingerprint = profile.fingerprint || profile.dna;

  return {
    reference: profile.reference,
    width: round(width),
    height: round(height),
    ratio: Number.isFinite(width / height) ? round(width / height) : null,
    area: round(area),
    perimeter: round(perimeter),
    compactness: Number.isFinite(area / (width * height)) ? round(area / (width * height)) : null,
    fillRatio: round(fingerprint?.summary?.fillRatio),
    contourCount: fingerprint?.summary?.contourCount ?? fingerprint?.contour?.contours?.length ?? null
  };
}

function buildDetectionDiagnostics(analysis, autoSettings) {
  const contours = analysis.debug?.contours || [];
  return {
    source: autoSettings?.source || null,
    contours: contours.length,
    holes: contours.reduce((sum, contour) => sum + (contour.holes?.length || 0), 0),
    detectedItems: analysis.items?.length || 0,
    segmentationMode: analysis.debug?.segmentationMode || null
  };
}

function summarizeSegmentation(segmentation) {
  if (!segmentation) return null;
  return {
    mode: segmentation.mode || null,
    components: numberOrNull(segmentation.components),
    keptComponents: numberOrNull(segmentation.keptComponents),
    rejectedComponents: numberOrNull(segmentation.rejectedComponents),
    threshold: numberOrNull(segmentation.threshold),
    edgePixels: numberOrNull(segmentation.edgePixels),
    filledPixels: numberOrNull(segmentation.filledPixels)
  };
}

function buildConfusionMatrix(results) {
  const map = new Map();
  for (const result of results) {
    if (result.success || !result.expectedReference || !result.bestReference) continue;
    const key = `${result.expectedReference} -> ${result.bestReference}`;
    const current = map.get(key) || {
      expectedReference: result.expectedReference,
      bestReference: result.bestReference,
      count: 0,
      files: []
    };
    current.count++;
    current.files.push(result.fileName);
    map.set(key, current);
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

function summarizeCandidates(candidates) {
  return candidates.map(candidate => ({
    rank: candidate.rank,
    reference: candidate.reference,
    designation: candidate.designation,
    score: candidate.score
  }));
}

function findProfile(collection, reference) {
  return collection?.profiles?.find(profile => sameReference(profile.reference, reference)) || null;
}

function scoreValue(candidate, key) {
  return round(candidate?.scoreDetails?.subscores?.[key]);
}

function algorithmRecommendation(score, samples, expectedWins, bestWins, averageDelta) {
  if (!samples) return 'insufficient-data';
  if (score >= 68 && expectedWins > bestWins) return 'increase';
  if (score <= 28 && bestWins > expectedWins && (averageDelta || 0) < -8) return 'disable';
  if (score <= 38 && bestWins > expectedWins) return 'reduce';
  return 'neutral';
}

function referenceFromFilename(fileName) {
  const dot = fileName.lastIndexOf('.');
  return (dot > 0 ? fileName.slice(0, dot) : fileName).trim().replace(/\.min$/i, '');
}

function isBenchmarkFile(file) {
  return isSvgFile(file) || /^image\//.test(file.type) || /\.(jpg|jpeg|png|webp|bmp)$/i.test(file.name);
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
  return total > 0 ? round(value * 100 / total) : 0;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? round(number) : null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
}

function saveJsonFile(data, fileName) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
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
  if (analysisPercent) analysisPercent.textContent = `${safePercent} %`;
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
  if (error?.filename) return `${error.filename}:${error.lineno || '?'} - ${error.message || 'Erreur script'}`;
  if (error?.type) return `Evenement ${error.type}`;
  return String(error);
}
