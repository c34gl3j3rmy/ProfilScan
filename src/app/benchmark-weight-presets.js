import { composeCandidateScore } from '../shape-engine/candidate-search/score-composition.js';

export const CANDIDATE_WEIGHT_PRESET_NAME = 'benchmark-2026-07-auto-187';

export const WEIGHT_PRESETS = [
  {
    name: CANDIDATE_WEIGHT_PRESET_NAME,
    description: 'Configuration candidate issue du benchmark du 20 juillet 2026 : EFD et structural renforces, Hu neutralise',
    status: 'candidate',
    benchmarkReference: {
      top1Accuracy: 100,
      previousTop1Accuracy: 97.04,
      top3Accuracy: 100,
      changedDecisions: 4,
      regressions: 0
    },
    base: { ratio: 19, radial: 16, fourier: 13, efd: 10, structural: 10, angle: 7, fill: 4, minutiae: 9, localFeature: 10 },
    advancedWeight: 0.25,
    advancedDetails: { hausdorff: 55, shapeContext: 5, icp: 30, ransac: 0, zernike: 10 }
  },
  {
    name: 'actuel-interface-sans-hu',
    description: 'Ancienne configuration candidate : poids interface historiques, Hu ignore, EFD et structural conserves en audit',
    status: 'historical',
    benchmarkReference: {
      top1Accuracy: 97.04,
      top3Accuracy: 99.26,
      top10Accuracy: 100,
      changedDecisions: 3,
      regressions: 2
    },
    base: { ratio: 25, radial: 22, fourier: 18, efd: 0, structural: 0, angle: 10, fill: 5, minutiae: 12, localFeature: 14 },
    advancedWeight: 0.35,
    advancedDetails: null
  },
  {
    name: 'profilscan-v3',
    description: 'Radial, angles, Hausdorff, ICP et signature locale renforces',
    status: 'experimental',
    base: { ratio: 18, radial: 30, fourier: 8, efd: 0, structural: 0, angle: 26, fill: 4, minutiae: 10, localFeature: 14 },
    advancedWeight: 0.25,
    advancedDetails: { hausdorff: 45, shapeContext: 10, icp: 30, ransac: 0, zernike: 15 }
  },
  {
    name: 'local-fort',
    description: 'Accent sur les details locaux, crochets, gorges et zones discriminantes',
    status: 'experimental',
    base: { ratio: 14, radial: 26, fourier: 6, efd: 0, structural: 0, angle: 24, fill: 3, minutiae: 12, localFeature: 20 },
    advancedWeight: 0.30,
    advancedDetails: { hausdorff: 42, shapeContext: 8, icp: 35, ransac: 0, zernike: 15 }
  },
  {
    name: 'radial-angle-local',
    description: 'Signature radiale, orientations et details locaux prioritaires',
    status: 'experimental',
    base: { ratio: 16, radial: 34, fourier: 6, efd: 0, structural: 0, angle: 28, fill: 3, minutiae: 8, localFeature: 16 },
    advancedWeight: 0.20,
    advancedDetails: { hausdorff: 50, shapeContext: 5, icp: 35, ransac: 0, zernike: 10 }
  }
];

const BASE_KEYS = ['ratio', 'radial', 'fourier', 'efd', 'structural', 'angle', 'fill', 'minutiae', 'localFeature'];
const ADVANCED_KEYS = ['hausdorff', 'shapeContext', 'icp', 'ransac', 'zernike'];
const SINGLE_ALGORITHM_KEYS = [...BASE_KEYS, 'advanced', ...ADVANCED_KEYS];
const EPSILON = 1e-6;

export function buildWeightPresetBenchmark(results) {
  return [
    ...buildSingleAlgorithmBenchmark(results),
    ...WEIGHT_PRESETS.map(preset => summarizePreset(results, preset, 'fixed')),
    ...buildOptimizedWeightBenchmark(results, 900)
  ].sort(comparePresetResults);
}

function buildSingleAlgorithmBenchmark(results) {
  return SINGLE_ALGORITHM_KEYS.map(key => {
    const isBase = BASE_KEYS.includes(key);
    return summarizePreset(results, {
      name: `algo-${key}`,
      description: `Classement avec le sous-score ${key} seul`,
      base: Object.fromEntries(BASE_KEYS.map(baseKey => [baseKey, isBase && baseKey === key ? 100 : 0])),
      advancedWeight: isBase ? 0 : 1,
      advancedDetails: key === 'advanced' || isBase
        ? null
        : Object.fromEntries(ADVANCED_KEYS.map(advancedKey => [advancedKey, advancedKey === key ? 100 : 0]))
    }, 'algorithm-only');
  });
}

function buildOptimizedWeightBenchmark(results, maxCombinations) {
  const candidates = generateWeightCandidates(maxCombinations)
    .map((preset, index) => summarizePreset(results, {
      ...preset,
      name: `auto-${String(index + 1).padStart(3, '0')}`,
      description: 'Combinaison generee automatiquement, Hu neutralise'
    }, 'auto'))
    .sort(comparePresetResults);

  const unique = [];
  const seen = new Set();
  for (const candidate of candidates) {
    const signature = JSON.stringify([candidate.baseWeights, candidate.advancedWeight, candidate.advancedDetails]);
    if (seen.has(signature)) continue;
    seen.add(signature);
    unique.push(candidate);
    if (unique.length >= 20) break;
  }
  return unique;
}

function generateWeightCandidates(limit) {
  const baseCandidates = buildBaseWeightCandidates();
  const advancedCandidates = buildAdvancedWeightCandidates();
  const advancedWeights = [0.15, 0.25, 0.35, 0.45, 0.55];
  const output = [];

  for (const base of baseCandidates) {
    for (const advancedDetails of advancedCandidates) {
      for (const advancedWeight of advancedWeights) {
        output.push({ base, advancedWeight, advancedDetails });
        if (output.length >= limit) return output;
      }
    }
  }
  return output;
}

function buildBaseWeightCandidates() {
  const variants = [
    { efd: 0, structural: 0 },
    { efd: 8, structural: 0 },
    { efd: 0, structural: 8 },
    { efd: 8, structural: 8 },
    { efd: 14, structural: 14 }
  ];
  const templates = [
    { ratio: 18, radial: 30, fourier: 8, angle: 26, fill: 4, minutiae: 10, localFeature: 14 },
    { ratio: 25, radial: 22, fourier: 18, angle: 10, fill: 5, minutiae: 12, localFeature: 14 },
    { ratio: 14, radial: 26, fourier: 6, angle: 24, fill: 3, minutiae: 12, localFeature: 20 },
    { ratio: 16, radial: 34, fourier: 6, angle: 28, fill: 3, minutiae: 8, localFeature: 16 }
  ];
  return templates.flatMap(template => variants.map(extra => normalizeWeights({ ...template, ...extra }, BASE_KEYS)));
}

function buildAdvancedWeightCandidates() {
  return [
    { hausdorff: 45, shapeContext: 10, icp: 30, ransac: 0, zernike: 15 },
    { hausdorff: 55, shapeContext: 5, icp: 30, ransac: 0, zernike: 10 },
    { hausdorff: 35, shapeContext: 15, icp: 40, ransac: 0, zernike: 10 },
    { hausdorff: 40, shapeContext: 10, icp: 35, ransac: 5, zernike: 10 }
  ].map(weights => normalizeWeights(weights, ADVANCED_KEYS));
}

function summarizePreset(results, preset, category) {
  const rows = (results || [])
    .filter(result => result.expectedKnownInBase && result.topCandidates?.length)
    .map(result => rescoreResult(result, preset));
  const evaluated = rows.filter(row => row.discriminating);
  const total = evaluated.length;

  return {
    name: preset.name,
    category,
    status: preset.status || null,
    description: preset.description,
    benchmarkReference: preset.benchmarkReference || null,
    baseWeights: preset.base,
    advancedWeight: preset.advancedWeight,
    advancedDetails: preset.advancedDetails,
    total,
    inputRows: rows.length,
    nonDiscriminating: rows.length - total,
    discriminating: total > 0,
    top1: evaluated.filter(row => row.top1).length,
    top3: evaluated.filter(row => row.top3).length,
    top10: evaluated.filter(row => row.top10).length,
    top1Accuracy: total ? percent(evaluated.filter(row => row.top1).length, total) : null,
    top3Accuracy: total ? percent(evaluated.filter(row => row.top3).length, total) : null,
    top10Accuracy: total ? percent(evaluated.filter(row => row.top10).length, total) : null,
    changedDecisions: evaluated.filter(row => row.changedDecision).length,
    newRegressions: evaluated.filter(row => row.previousTop1 && !row.top1).length,
    rows
  };
}

function rescoreResult(result, preset) {
  const rescored = result.topCandidates.map(candidate => ({
    ...candidate,
    presetScore: scoreCandidateWithPreset(candidate, preset)
  }));
  const values = rescored.map(candidate => candidate.presetScore).filter(Number.isFinite);
  const spread = values.length ? Math.max(...values) - Math.min(...values) : 0;
  if (spread <= EPSILON) return emptyRow(result, spread);

  rescored.sort((a, b) => b.presetScore - a.presetScore);
  const expected = normalizeReference(result.expectedReference);
  const expectedRank = rescored.findIndex(candidate => normalizeReference(candidate.reference) === expected) + 1;
  const winner = rescored[0] || null;
  const top1 = normalizeReference(winner?.reference) === expected;

  return {
    fileName: result.fileName,
    expectedReference: result.expectedReference,
    previousBestReference: result.bestReference || null,
    newBestReference: winner?.reference || null,
    newBestScore: round(winner?.presetScore),
    expectedRank: expectedRank || null,
    previousTop1: Boolean(result.success),
    top1,
    top3: Boolean(expectedRank && expectedRank <= 3),
    top10: Boolean(expectedRank && expectedRank <= 10),
    changedDecision: Boolean(winner && result.bestReference && winner.reference !== result.bestReference),
    discriminating: true,
    scoreSpread: round(spread)
  };
}

export function scoreCandidateWithPreset(candidate, preset) {
  const subscores = candidate.scoreDetails?.subscores || {};
  const rawSubscores = candidate.scoreDetails?.rawSubscores || subscores;
  const advancedRawScore = preset.advancedDetails
    ? weightedScore(rawSubscores, preset.advancedDetails, ADVANCED_KEYS)
    : numeric(rawSubscores.advancedRaw, numeric(subscores.advancedRaw, numeric(subscores.advanced)));

  return composeCandidateScore({
    baseSubscores: rawSubscores,
    baseWeights: preset.base,
    advancedSubscores: rawSubscores,
    advancedRawScore,
    advancedWeight: preset.advancedWeight
  }).score;
}

function weightedScore(scores, weights, keys) {
  const total = keys.reduce((sum, key) => sum + Math.max(0, Number(weights?.[key]) || 0), 0);
  if (!total) return 0;
  return keys.reduce((sum, key) => sum + numeric(scores[key]) * Math.max(0, Number(weights?.[key]) || 0), 0) / total;
}

function normalizeWeights(weights, keys) {
  const total = keys.reduce((sum, key) => sum + Math.max(0, Number(weights?.[key]) || 0), 0);
  return Object.fromEntries(keys.map(key => [key, total ? Math.round(Math.max(0, Number(weights?.[key]) || 0) * 100 / total) : 0]));
}

function emptyRow(result, spread) {
  return {
    fileName: result.fileName,
    expectedReference: result.expectedReference,
    previousBestReference: result.bestReference || null,
    newBestReference: null,
    newBestScore: null,
    expectedRank: null,
    previousTop1: Boolean(result.success),
    top1: false,
    top3: false,
    top10: false,
    changedDecision: false,
    discriminating: false,
    scoreSpread: round(spread)
  };
}

function comparePresetResults(left, right) {
  return (right.top1Accuracy ?? -1) - (left.top1Accuracy ?? -1)
    || (right.top3Accuracy ?? -1) - (left.top3Accuracy ?? -1)
    || (right.top10Accuracy ?? -1) - (left.top10Accuracy ?? -1)
    || (left.newRegressions ?? Infinity) - (right.newRegressions ?? Infinity);
}

function normalizeReference(value) {
  return String(value || '').trim().toLowerCase();
}

function numeric(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function percent(value, total) {
  return total > 0 ? round(value * 100 / total) : 0;
}

function round(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
}
