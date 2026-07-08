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
  saveJsonFile(report, 'profilscan-benchmark-summary-' + timestampForFile() + '.json');
  const bestPreset = report.weightPresetBenchmark?.[0];
  const bestText = bestPreset ? ' - meilleur preset ' + bestPreset.name + ' : ' + bestPreset.top1Accuracy + '% Top 1' : '';
  setProgress(100, 'Benchmark termine', results.length + ' images analysees - ' + report.summary.top1Accuracy + '% Top 1 - ' + report.summary.top3Accuracy + '% Top 3' + bestText + ' - rapport optimise ChatGPT genere', 'done');
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
  const bestProfile = findProfile(collection, best?.reference);
  const expectedCandidateProfile = findProfile(collection, expectedCandidate?.reference);
  const topCandidates = (best?.topCandidates || []).slice(0, 10).map((candidate, index) => ({
    rank: index + 1,
    reference: candidate.reference,
    designation: candidate.designation,
    score: round(candidate.score),
    scoreDetails: candidate.scoreDetails
  }));
  const expectedRank = topCandidates.find(candidate => sameReference(candidate.reference, expectedReference))?.rank || null;
  const success = sameReference(best?.reference, expectedReference);
  const algorithmAudit = buildAlgorithmAudit(best, expectedCandidate);
  const algorithmRanks = buildAlgorithmRanks(topCandidates, expectedReference, best?.reference);
  const algorithmVotes = buildAlgorithmVotes(algorithmRanks, expectedReference, best?.reference);
  const geometryDiagnostics = buildGeometryDiagnostics(expectedProfile, bestProfile, expectedCandidateProfile, best, expectedCandidate);

  const result = {
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
    segmentation: summarizeSegmentation(analysis.debug?.segmentation),
    detectionDiagnostics: buildDetectionDiagnostics(analysis, autoSettings),
    geometryDiagnostics,
    autoSettings,
    settings,
    expectedCandidate: expectedCandidate ? {
      reference: expectedCandidate.reference,
      designation: expectedCandidate.designation,
      score: round(expectedCandidate.score),
      rank: expectedCandidate.rank,
      scoreDetails: expectedCandidate.scoreDetails
    } : null,
    algorithmAudit,
    algorithmRanks,
    algorithmVotes,
    topCandidates: summarizeTopCandidates(topCandidates)
  };

  result.candidateSearchDiagnostics = buildCandidateSearchDiagnostics(result);
  result.failureAnalysis = buildFailureAnalysis(result);
  return result;
}

function buildBenchmarkReport({ startedAt, files, results, errors, collection }) {
  const summary = summarizeBenchmark(results, errors);
  const noDetectionDetails = summarizeNoDetections(results);
  const failureSummary = summarizeFailures(results);
  const algorithmEffectiveness = summarizeAlgorithmEffectiveness(results);
  const algorithmVotes = summarizeGlobalAlgorithmVotes(results);
  const weightPresetBenchmark = summarizeWeightPresetBenchmark(buildWeightPresetBenchmark(results));
  const confusionMatrix = buildConfusionMatrix(results);
  const confusionFamilies = buildConfusionFamilies(results);
  const candidateSearchDiagnostics = summarizeCandidateSearchDiagnostics(results);
  const actionableRecommendations = buildActionableRecommendations({ summary, noDetectionDetails, failureSummary, algorithmEffectiveness, confusionFamilies, candidateSearchDiagnostics });
  const executiveSummary = buildExecutiveSummary({ summary, noDetectionDetails, failureSummary, algorithmEffectiveness, confusionFamilies, actionableRecommendations });

  return {
    type: 'ProfilScan batch benchmark ChatGPT optimized report',
    version: 'batch-benchmark-chatgpt-v1',
    startedAt,
    completedAt: new Date().toISOString(),
    input: { mode: 'multi-image-files', files: files.length, expectedReferenceRule: 'nom exact du fichier sans extension', svgMode: 'shared-rasterizer-before-analysis' },
    base: { name: collection?.name, profiles: collection?.profiles?.length, importedAt: collection?.importedAt, pipelineSettings: collection?.pipelineSettings },
    executiveSummary,
    summary,
    priorityFailures: buildPriorityFailures(results),
    noDetectionDetails,
    candidateSearchDiagnostics,
    failureSummary,
    algorithmEffectiveness,
    algorithmVotes,
    geometrySignals: summarizeGeometrySignals(results),
    weightPresetBenchmark,
    confusionMatrix,
    confusionFamilies,
    actionableRecommendations,
    reportForChatGPT: buildReportForChatGPT({ summary, noDetectionDetails, failureSummary, candidateSearchDiagnostics, algorithmEffectiveness, confusionFamilies, actionableRecommendations }),
    errors
  };
}

function buildExecutiveSummary({ summary, noDetectionDetails, failureSummary, algorithmEffectiveness, confusionFamilies, actionableRecommendations }) {
  const outsideTop10 = failureSummary.outsideTop10.length;
  const top3ButNotTop1 = failureSummary.top3ButNotTop1.length;
  const bestAlgorithms = algorithmEffectiveness.filter(item => item.recommendation === 'increase').slice(0, 5).map(item => item.key);
  const weakAlgorithms = algorithmEffectiveness.filter(item => ['reduce', 'disable'].includes(item.recommendation)).slice(0, 5).map(item => item.key);
  return {
    verdict: summary.failedTop1 === 0 ? 'excellent' : noDetectionDetails.length ? 'pipeline-and-scoring-to-check' : outsideTop10 ? 'candidate-search-to-improve' : 'scoring-to-tune',
    top1Accuracy: summary.top1Accuracy,
    failedTop1: summary.failedTop1,
    noDetection: noDetectionDetails.length,
    outsideTop10,
    top3ButNotTop1,
    mainConfusions: confusionFamilies.slice(0, 5),
    bestAlgorithms,
    weakAlgorithms,
    priorityActions: actionableRecommendations.slice(0, 5)
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

function summarizeNoDetections(results) {
  return results
    .filter(result => !result.detectedItems)
    .map(result => ({
      fileName: result.fileName,
      expectedReference: result.expectedReference,
      expectedKnownInBase: result.expectedKnownInBase,
      source: result.autoSettings?.source || null,
      contours: result.contours,
      holes: result.holes,
      segmentationMode: result.segmentationMode,
      detectionDiagnostics: result.detectionDiagnostics,
      expectedGeometry: result.geometryDiagnostics?.expected || null,
      failureAnalysis: result.failureAnalysis
    }));
}

function summarizeFailures(results) {
  const failed = results.filter(result => result.expectedKnownInBase && !result.success);
  return {
    outsideTop10: failed.filter(result => !result.top10).map(summarizeFailedProfile),
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
    scoreGap: round((result.bestScore ?? 0) - (result.expectedCandidate?.score ?? 0)),
    algorithmVotes: result.algorithmVotes?.counts || {},
    strongestAlgorithmWinners: strongestAlgorithmWinners(result.algorithmRanks),
    geometryDiagnostics: result.geometryDiagnostics,
    detectionDiagnostics: result.detectionDiagnostics,
    candidateSearchDiagnostics: result.candidateSearchDiagnostics,
    topCandidates: result.topCandidates?.slice(0, 10) || [],
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
      decisionHint: result.failureAnalysis?.decisionHint,
      expectedRank: result.expectedRank,
      bestScore: result.bestScore,
      candidateSearchStatus: result.candidateSearchDiagnostics?.status,
      topCandidates: result.topCandidates?.slice(0, 5) || []
    }))
    .sort((a, b) => b.severity - a.severity);
}

function failureSeverity(result) {
  if (!result.detectedItems) return 100;
  if (!result.expectedKnownInBase) return 90;
  if (!result.expectedCandidate) return 80;
  if (!result.top10) return 70;
  if (!result.top3) return 50;
  return 25;
}

function summarizeAlgorithmEffectiveness(results) {
  const failedWithExpected = results.filter(result => result.expectedKnownInBase && !result.success && result.expectedCandidate);
  return ALGORITHM_KEYS.map(key => {
    const rows = failedWithExpected.map(result => result.algorithmAudit?.rows?.find(row => row.key === key)).filter(Boolean);
    const usableRows = rows.filter(row => Number.isFinite(row.delta));
    const expectedWins = usableRows.filter(row => row.delta > 0).length;
    const bestWins = usableRows.filter(row => row.delta < 0).length;
    const neutral = usableRows.filter(row => row.delta === 0).length;
    const averageDelta = average(usableRows.map(row => row.delta));
    const samples = usableRows.length;
    const score = samples ? clamp(round(50 + ((expectedWins - bestWins) / samples) * 35 + clamp(averageDelta || 0, -25, 25) * 0.6), 0, 100) : null;
    return {
      key,
      samples,
      expectedWins,
      bestWins,
      neutral,
      averageDelta,
      effectivenessScore: score,
      recommendation: algorithmRecommendation(score, samples, expectedWins, bestWins, averageDelta)
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
      if (vote?.winnerReference) winners.set(vote.winnerReference, (winners.get(vote.winnerReference) || 0) + 1);
    }
    return { key, votes, topWinners: Array.from(winners.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([reference, count]) => ({ reference, count })) };
  }).filter(row => row.votes.expected || row.votes.currentTop1 || row.votes.other || row.votes.none);
}

function summarizeCandidateSearchDiagnostics(results) {
  return results
    .filter(result => result.expectedKnownInBase && !result.success)
    .map(result => result.candidateSearchDiagnostics)
    .filter(Boolean);
}

function buildCandidateSearchDiagnostics(result) {
  if (!result.expectedKnownInBase) return { fileName: result.fileName, expectedReference: result.expectedReference, status: 'expected-not-in-base' };
  if (!result.detectedItems) return { fileName: result.fileName, expectedReference: result.expectedReference, status: 'no-detection-before-candidate-search' };
  if (result.expectedRank) {
    return {
      fileName: result.fileName,
      expectedReference: result.expectedReference,
      status: result.expectedRank === 1 ? 'expected-top1' : result.expectedRank <= 3 ? 'expected-in-top3' : 'expected-in-top10',
      expectedRank: result.expectedRank,
      bestReference: result.bestReference,
      scoreGap: round((result.bestScore ?? 0) - (result.expectedCandidate?.score ?? 0))
    };
  }
  return {
    fileName: result.fileName,
    expectedReference: result.expectedReference,
    status: 'expected-missing-from-top10',
    inspectedCandidateLimit: 10,
    bestReference: result.bestReference,
    bestScore: result.bestScore,
    top5Alternatives: result.topCandidates?.slice(0, 5) || [],
    likelyStage: 'candidate-search-or-signature-generation',
    nextUsefulDiagnostic: 'calculer-le-rang-attendu-top50-ou-top100'
  };
}

function summarizeGeometrySignals(results) {
  const failed = results.filter(result => result.expectedKnownInBase && !result.success && result.geometryDiagnostics?.deltas);
  return {
    samples: failed.length,
    averageRatioDelta: average(failed.map(result => Math.abs(result.geometryDiagnostics.deltas.expectedVsBestRatio)).filter(Number.isFinite)),
    averageCompactnessDelta: average(failed.map(result => Math.abs(result.geometryDiagnostics.deltas.expectedVsBestCompactness)).filter(Number.isFinite)),
    averageFillRatioDelta: average(failed.map(result => Math.abs(result.geometryDiagnostics.deltas.expectedVsBestFillRatio)).filter(Number.isFinite)),
    averageContourDensityDelta: average(failed.map(result => Math.abs(result.geometryDiagnostics.deltas.expectedVsBestContourDensity)).filter(Number.isFinite))
  };
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
    failureRows: (preset.rows || [])
      .filter(row => !row.top1 || row.changedDecision)
      .slice(0, 10)
      .map(row => ({
        fileName: row.fileName,
        expectedReference: row.expectedReference,
        previousBestReference: row.previousBestReference,
        newBestReference: row.newBestReference,
        expectedRank: row.expectedRank,
        top1: row.top1,
        top3: row.top3,
        changedDecision: row.changedDecision
      }))
  }));
}

function buildActionableRecommendations({ summary, noDetectionDetails, failureSummary, algorithmEffectiveness, confusionFamilies, candidateSearchDiagnostics }) {
  const recommendations = [];
  if (noDetectionDetails.length) recommendations.push({ priority: 1, action: 'corriger-segmentation-ou-rasterisation', reason: noDetectionDetails.length + ' profils sans detection', targets: noDetectionDetails.map(item => item.expectedReference) });
  const missing = candidateSearchDiagnostics.filter(item => item.status === 'expected-missing-from-top10');
  if (missing.length) recommendations.push({ priority: 2, action: 'ajouter-rang-attendu-top50-top100', reason: 'Le bon profil est absent du Top10 pour certains echecs', targets: missing.map(item => item.expectedReference) });
  const top3 = failureSummary.top3ButNotTop1 || [];
  if (top3.length) recommendations.push({ priority: 3, action: 'ajuster-ponderation-fusion', reason: 'Le bon profil est proche du Top1 pour certains cas', targets: top3.map(item => item.expectedReference) });
  const weak = algorithmEffectiveness.filter(item => ['reduce', 'disable'].includes(item.recommendation));
  if (weak.length) recommendations.push({ priority: 4, action: 'reduire-algorithmes-penalisants', reason: 'Certains algorithmes favorisent souvent le mauvais Top1', targets: weak.map(item => item.key) });
  const strong = algorithmEffectiveness.filter(item => item.recommendation === 'increase');
  if (strong.length) recommendations.push({ priority: 5, action: 'renforcer-algorithmes-fiables', reason: 'Certains algorithmes favorisent davantage le bon profil', targets: strong.map(item => item.key) });
  if (confusionFamilies.length) recommendations.push({ priority: 6, action: 'analyser-familles-confuses', reason: 'Des familles de profils se melangent', targets: confusionFamilies.slice(0, 5).map(item => item.expectedFamily + '->' + item.bestFamily) });
  if (!recommendations.length && summary.failedTop1 === 0) recommendations.push({ priority: 1, action: 'aucune-action-critique', reason: 'Tous les profils testes sont corrects', targets: [] });
  return recommendations.sort((a, b) => a.priority - b.priority);
}

function buildReportForChatGPT({ summary, noDetectionDetails, failureSummary, candidateSearchDiagnostics, algorithmEffectiveness, confusionFamilies, actionableRecommendations }) {
  return {
    summary: {
      total: summary.total,
      top1Accuracy: summary.top1Accuracy,
      failedTop1: summary.failedTop1,
      noDetection: summary.noDetection,
      outsideTop10: failureSummary.outsideTop10.length,
      top3ButNotTop1: failureSummary.top3ButNotTop1.length
    },
    priorityFailures: [...failureSummary.outsideTop10, ...failureSummary.top3ButNotTop1].slice(0, 12).map(item => ({
      expectedReference: item.expectedReference,
      bestReference: item.bestReference,
      reason: item.failureAnalysis?.dominantReason,
      decisionHint: item.failureAnalysis?.decisionHint,
      expectedRank: item.expectedRank,
      bestScore: item.bestScore
    })),
    noDetections: noDetectionDetails.map(item => item.expectedReference),
    missingFromTop10: candidateSearchDiagnostics.filter(item => item.status === 'expected-missing-from-top10').map(item => item.expectedReference),
    algorithmsToIncrease: algorithmEffectiveness.filter(item => item.recommendation === 'increase').map(item => item.key),
    algorithmsToReduce: algorithmEffectiveness.filter(item => ['reduce', 'disable'].includes(item.recommendation)).map(item => item.key),
    mainConfusions: confusionFamilies.slice(0, 8),
    recommendedNextActions: actionableRecommendations.slice(0, 6)
  };
}

function buildAlgorithmRanks(topCandidates, expectedReference, bestReference) {
  return ALGORITHM_KEYS.map(key => {
    const ranked = topCandidates
      .map(candidate => ({ reference: candidate.reference, score: scoreValue(candidate, key) }))
      .filter(candidate => Number.isFinite(candidate.score))
      .sort((a, b) => b.score - a.score);
    return {
      key,
      winnerReference: ranked[0]?.reference || null,
      expectedRank: ranked.findIndex(candidate => sameReference(candidate.reference, expectedReference)) + 1 || null,
      bestRank: ranked.findIndex(candidate => sameReference(candidate.reference, bestReference)) + 1 || null
    };
  });
}

function buildAlgorithmVotes(algorithmRanks, expectedReference, bestReference) {
  const perAlgorithm = algorithmRanks.map(row => ({
    key: row.key,
    winnerReference: row.winnerReference,
    expectedRank: row.expectedRank,
    bestRank: row.bestRank,
    vote: !row.winnerReference ? 'none' : sameReference(row.winnerReference, expectedReference) ? 'expected' : sameReference(row.winnerReference, bestReference) ? 'currentTop1' : 'other'
  }));
  const counts = perAlgorithm.reduce((acc, row) => {
    acc[row.vote] = (acc[row.vote] || 0) + 1;
    return acc;
  }, {});
  return { counts, perAlgorithm };
}

function strongestAlgorithmWinners(algorithmRanks) {
  return (algorithmRanks || [])
    .filter(row => row.winnerReference)
    .slice(0, 20)
    .reduce((acc, row) => {
      const current = acc.find(item => item.reference === row.winnerReference);
      if (current) current.algorithms.push(row.key);
      else acc.push({ reference: row.winnerReference, algorithms: [row.key] });
      return acc;
    }, [])
    .sort((a, b) => b.algorithms.length - a.algorithms.length)
    .slice(0, 5);
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

function buildGeometryDiagnostics(expectedProfile, bestProfile, expectedCandidateProfile, best, expectedCandidate) {
  const expected = buildProfileGeometry(expectedProfile);
  const bestGeometry = withScore(buildProfileGeometry(bestProfile), best?.score);
  const expectedCandidateGeometry = withScore(buildProfileGeometry(expectedCandidateProfile), expectedCandidate?.score);
  return {
    expected,
    best: bestGeometry,
    expectedCandidate: expectedCandidateGeometry,
    deltas: {
      expectedVsBestRatio: delta(expected?.ratio, bestGeometry?.ratio),
      expectedVsBestCompactness: delta(expected?.compactness, bestGeometry?.compactness),
      expectedVsBestFillRatio: delta(expected?.fillRatio, bestGeometry?.fillRatio),
      expectedVsBestContourDensity: delta(expected?.contourDensity, bestGeometry?.contourDensity),
      bestVsExpectedCandidateScore: delta(best?.score, expectedCandidate?.score)
    }
  };
}

function withScore(geometry, score) {
  if (!geometry) return null;
  return { ...geometry, score: round(score) };
}

function buildProfileGeometry(profile) {
  if (!profile) return null;
  const width = Number(profile.width);
  const height = Number(profile.height);
  const area = Number(profile.surface || profile.area);
  const perimeter = Number(profile.perimeter || profile.externalPerimeter || profile.totalPerimeter);
  const diagonal = Number(profile.profileDiagonal || Math.hypot(width || 0, height || 0));
  const fingerprint = profile.fingerprint || profile.dna;
  const localComplexity = summarizeLocalComplexity(fingerprint);
  return {
    reference: profile.reference,
    width: round(width),
    height: round(height),
    ratio: Number.isFinite(width / height) ? round(width / height) : null,
    area: round(area),
    perimeter: round(perimeter),
    compactness: round(area / ((width || 0) * (height || 0))),
    contourDensity: round(perimeter / (diagonal || 1)),
    fillRatio: round(fingerprint?.summary?.fillRatio),
    complexityScore: localComplexity.complexityScore,
    complexityKind: localComplexity.complexityKind
  };
}

function summarizeLocalComplexity(fingerprint) {
  const minutiae = fingerprint?.subsignatures?.minutiae || fingerprint?.descriptors?.minutiae || fingerprint?.minutiae;
  const localFeature = fingerprint?.subsignatures?.localFeature || fingerprint?.descriptors?.localFeature || fingerprint?.localFeature;
  const corners = Number(minutiae?.counts?.corners) || 0;
  const grooves = Number(localFeature?.features?.grooves) || 0;
  const hooks = Number(localFeature?.features?.hooks) || 0;
  const notches = Number(localFeature?.features?.notches) || 0;
  const sharpTips = Number(localFeature?.features?.sharpTips) || 0;
  const complexityScore = round(corners + grooves * 2 + hooks * 2 + notches * 1.5 + sharpTips * 2);
  return { complexityScore, complexityKind: complexityScore >= 90 ? 'complex' : complexityScore >= 45 ? 'medium' : 'simple' };
}

function buildDetectionDiagnostics(analysis, autoSettings) {
  const contours = analysis.debug?.contours || [];
  const largestContour = contours
    .map(contour => ({ area: numberOrNull(contour.area), points: contour.points?.length || contour.length || 0, holes: contour.holes?.length || 0 }))
    .sort((a, b) => (b.area || 0) - (a.area || 0))[0] || null;
  return {
    source: autoSettings?.source || null,
    contours: contours.length,
    largestContour,
    detectedItems: analysis.items?.length || 0,
    segmentationMode: analysis.debug?.segmentationMode || null
  };
}

function buildFailureAnalysis(result) {
  if (!result.expectedKnownInBase) return { dominantReason: 'reference-absente', decisionHint: 'verifier-le-nom-du-fichier-ou-la-base', notes: ['La reference attendue est absente de la base importee.'] };
  if (!result.detectedItems) return { dominantReason: 'no-detection', decisionHint: 'corriger-segmentation-ou-rasterisation', notes: ['Aucun contour exploitable detecte avant le matching.'] };
  if (!result.expectedCandidate) return { dominantReason: 'expected-outside-top10', decisionHint: 'analyser-generation-signature-ou-filtrage-candidats', notes: ['Le bon profil ne figure pas dans le Top10, les deltas par algorithme ne sont donc pas calculables.'] };

  const helpful = result.algorithmAudit?.rows?.filter(row => Number(row.delta) > 0).sort((a, b) => b.delta - a.delta).slice(0, 5).map(row => ({ key: row.key, delta: row.delta })) || [];
  const harmful = result.algorithmAudit?.rows?.filter(row => Number(row.delta) < 0).sort((a, b) => a.delta - b.delta).slice(0, 5).map(row => ({ key: row.key, delta: row.delta })) || [];
  const geometry = result.geometryDiagnostics?.deltas || {};
  const notes = [];
  if (Math.abs(geometry.expectedVsBestRatio || 0) > 0.25) notes.push('Ecart de ratio important entre attendu et Top1.');
  if (Math.abs(geometry.expectedVsBestFillRatio || 0) > 0.12) notes.push('Ecart de remplissage important entre attendu et Top1.');
  if (harmful.some(row => ['localFeature', 'minutiae', 'localStage'].includes(row.key))) notes.push('Les descripteurs locaux penalisent le bon profil.');
  if (harmful.some(row => ['ratio', 'ratioGate'].includes(row.key))) notes.push('Le ratio ou son gate favorise le mauvais profil.');
  if (familyKey(result.expectedReference) === familyKey(result.bestReference)) notes.push('Confusion dans la meme famille de profils.');

  return {
    dominantReason: guessFailureReason(result),
    decisionHint: decisionHintFromReason(guessFailureReason(result)),
    helpfulAlgorithms: helpful,
    harmfulAlgorithms: harmful,
    algorithmVoteCounts: result.algorithmVotes?.counts || {},
    notes
  };
}

function decisionHintFromReason(reason) {
  const map = {
    'reference-absente': 'verifier-la-base',
    'no-detection': 'corriger-segmentation-ou-rasterisation',
    'expected-outside-top10': 'ameliorer-candidate-search-ou-signature',
    'ratio-conflict': 'reduire-ou-revoir-ratio-gate',
    'local-confusion': 'reduire-ou-recalibrer-descripteurs-locaux',
    'family-confusion': 'ajouter-discriminants-famille-proche',
    'scoring-fusion-issue': 'revoir-ponderation-fusion'
  };
  return map[reason] || 'analyse-manuelle';
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

function summarizeTopCandidates(topCandidates) {
  return topCandidates.map(candidate => ({ rank: candidate.rank, reference: candidate.reference, designation: candidate.designation, score: candidate.score }));
}

function buildDebugSamples(results) {
  return results
    .filter(result => !result.success || !result.detectedItems)
    .slice(0, 8)
    .map(result => ({
      fileName: result.fileName,
      expectedReference: result.expectedReference,
      bestReference: result.bestReference,
      expectedRank: result.expectedRank,
      bestScore: result.bestScore,
      expectedScore: result.expectedCandidate?.score ?? null,
      failureAnalysis: result.failureAnalysis,
      candidateSearchDiagnostics: result.candidateSearchDiagnostics,
      algorithmVotes: result.algorithmVotes?.counts,
      geometryDiagnostics: result.geometryDiagnostics,
      detectionDiagnostics: result.detectionDiagnostics,
      topCandidates: result.topCandidates?.slice(0, 5)
    }));
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
  return Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 20);
}

function familyKey(reference) {
  const value = String(reference || '').toUpperCase();
  return value.match(/^[A-Z]+\d{0,2}/)?.[0] || value.match(/^\d{2,3}/)?.[0] || value.slice(0, 3);
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

function algorithmRecommendation(score, samples, expectedWins, bestWins, averageDelta) {
  if (!samples) return 'insufficient-data';
  if (score >= 68 && expectedWins > bestWins) return 'increase';
  if (score <= 38 && bestWins > expectedWins) return 'reduce';
  if (score <= 28 && (averageDelta || 0) < -8) return 'disable';
  return 'neutral';
}

function guessFailureReason(result) {
  if (!result.expectedKnownInBase) return 'reference-absente';
  if (!result.detectedItems) return 'no-detection';
  if (!result.expectedCandidate) return 'expected-outside-top10';
  if (result.algorithmAudit?.bestWins?.includes('ratio') || result.algorithmAudit?.bestWins?.includes('ratioGate')) return 'ratio-conflict';
  if (result.algorithmAudit?.bestWins?.includes('localFeature') || result.algorithmAudit?.bestWins?.includes('minutiae')) return 'local-confusion';
  if (familyKey(result.expectedReference) === familyKey(result.bestReference)) return 'family-confusion';
  return 'scoring-fusion-issue';
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

function delta(a, b) {
  const first = Number(a);
  const second = Number(b);
  return Number.isFinite(first) && Number.isFinite(second) ? round(first - second) : null;
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
