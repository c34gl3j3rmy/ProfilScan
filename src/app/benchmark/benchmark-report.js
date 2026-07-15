import {
  CANDIDATE_WEIGHT_PRESET_NAME,
  buildWeightPresetBenchmark
} from '../benchmark-weight-presets.js';
import {
  summarizeAlgorithmEffectiveness,
  summarizeGlobalAlgorithmVotes
} from './benchmark-algorithms.js';
import { percent, round } from './benchmark-utils.js';

export function buildBenchmarkReport({ startedAt, files, results, errors, collection }

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

export function summarizeCandidates(candidates) {
  return candidates.map(candidate => ({
    rank: candidate.rank,
    reference: candidate.reference,
    designation: candidate.designation,
    score: candidate.score
  }));
}
