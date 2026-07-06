export const WEIGHT_PRESETS = [
  {
    name: 'actuel-interface',
    description: 'Poids historiques de l interface avant optimisation',
    base: { ratio: 25, radial: 22, hu: 20, fourier: 18, angle: 10, fill: 5 },
    advancedWeight: 0.35,
    advancedDetails: null
  },
  {
    name: 'profilscan-v2',
    description: 'Reglage issu du premier benchmark : Hu presque neutralise, radial/angles/Hausdorff/ICP renforces',
    base: { ratio: 20, radial: 35, hu: 0, fourier: 10, angle: 30, fill: 5 },
    advancedWeight: 0.25,
    advancedDetails: { hausdorff: 45, shapeContext: 15, icp: 30, ransac: 0, zernike: 10 }
  },
  {
    name: 'faible-hu',
    description: 'Conserve un faible poids Hu pour tester s il apporte encore un signal utile',
    base: { ratio: 22, radial: 30, hu: 4, fourier: 14, angle: 25, fill: 5 },
    advancedWeight: 0.25,
    advancedDetails: { hausdorff: 45, shapeContext: 15, icp: 30, ransac: 0, zernike: 10 }
  },
  {
    name: 'radial-angle',
    description: 'Met l accent sur les signatures les plus stables du premier benchmark',
    base: { ratio: 20, radial: 35, hu: 0, fourier: 10, angle: 30, fill: 5 },
    advancedWeight: 0.35,
    advancedDetails: { hausdorff: 40, shapeContext: 20, icp: 30, ransac: 0, zernike: 10 }
  }
];

const BASE_KEYS = ['ratio', 'radial', 'hu', 'fourier', 'angle', 'fill'];
const ADVANCED_KEYS = ['hausdorff', 'shapeContext', 'icp', 'ransac', 'zernike'];

export function buildWeightPresetBenchmark(results) {
  const fixed = WEIGHT_PRESETS.map(preset => summarizePreset(results, preset));
  const optimized = buildOptimizedWeightBenchmark(results, 800);
  return [...fixed, ...optimized]
    .sort((a, b) => b.top1Accuracy - a.top1Accuracy || b.top3Accuracy - a.top3Accuracy || b.top10Accuracy - a.top10Accuracy);
}

function buildOptimizedWeightBenchmark(results, maxCombinations) {
  const candidates = generateWeightCandidates(maxCombinations).map((preset, index) => summarizePreset(results, {
    ...preset,
    name: 'auto-' + String(index + 1).padStart(3, '0'),
    description: 'Combinaison generee automatiquement par le benchmark'
  }));

  const unique = [];
  const seen = new Set();
  for (const candidate of candidates.sort((a, b) => b.top1Accuracy - a.top1Accuracy || b.top3Accuracy - a.top3Accuracy || b.top10Accuracy - a.top10Accuracy)) {
    const signature = JSON.stringify({ base: candidate.baseWeights, advanced: candidate.advancedWeight, details: candidate.advancedDetails });
    if (seen.has(signature)) continue;
    seen.add(signature);
    unique.push(candidate);
    if (unique.length >= 20) break;
  }
  return unique;
}

function generateWeightCandidates(maxCombinations) {
  const baseCandidates = buildBaseWeightCandidates();
  const advancedCandidates = buildAdvancedWeightCandidates();
  const advancedWeights = [0.15, 0.25, 0.35, 0.45, 0.55];
  const output = [];

  for (const base of baseCandidates) {
    for (const advancedDetails of advancedCandidates) {
      for (const advancedWeight of advancedWeights) {
        output.push({ base, advancedWeight, advancedDetails });
        if (output.length >= maxCombinations) return output;
      }
    }
  }

  return output;
}

function buildBaseWeightCandidates() {
  const output = [];
  const ratios = [12, 18, 24, 30];
  const radials = [24, 30, 36, 42];
  const hus = [0, 2, 5, 8];
  const fouriers = [6, 10, 14, 18];
  const angles = [18, 24, 30, 36];
  const fill = 4;

  for (const ratio of ratios) {
    for (const radial of radials) {
      for (const hu of hus) {
        for (const fourier of fouriers) {
          for (const angle of angles) {
            output.push(normalizeBaseWeights({ ratio, radial, hu, fourier, angle, fill }));
          }
        }
      }
    }
  }
  return output;
}

function buildAdvancedWeightCandidates() {
  const output = [];
  const hausdorffs = [35, 45, 55, 65];
  const shapes = [5, 10, 15, 25];
  const icps = [20, 30, 40, 50];
  const ransacs = [0, 3, 6];
  const zernikes = [5, 10, 15];

  for (const hausdorff of hausdorffs) {
    for (const shapeContext of shapes) {
      for (const icp of icps) {
        for (const ransac of ransacs) {
          for (const zernike of zernikes) {
            output.push(normalizeAdvancedWeights({ hausdorff, shapeContext, icp, ransac, zernike }));
          }
        }
      }
    }
  }
  return output;
}

function normalizeBaseWeights(weights) {
  const total = sumValues(weights, BASE_KEYS);
  if (total <= 0) return { ratio: 20, radial: 35, hu: 0, fourier: 10, angle: 30, fill: 5 };
  return Object.fromEntries(BASE_KEYS.map(key => [key, Math.round((weights[key] || 0) * 100 / total)]));
}

function normalizeAdvancedWeights(weights) {
  const total = sumValues(weights, ADVANCED_KEYS);
  if (total <= 0) return { hausdorff: 45, shapeContext: 15, icp: 30, ransac: 0, zernike: 10 };
  return Object.fromEntries(ADVANCED_KEYS.map(key => [key, Math.round((weights[key] || 0) * 100 / total)]));
}

function summarizePreset(results, preset) {
  const rows = results
    .filter(result => result.expectedKnownInBase && Array.isArray(result.topCandidates) && result.topCandidates.length)
    .map(result => rescoreResult(result, preset));
  const total = rows.length;
  const top1 = rows.filter(row => row.top1).length;
  const top3 = rows.filter(row => row.top3).length;
  const top10 = rows.filter(row => row.top10).length;

  return {
    name: preset.name,
    description: preset.description,
    baseWeights: preset.base,
    advancedWeight: preset.advancedWeight,
    advancedDetails: preset.advancedDetails,
    total,
    top1,
    top3,
    top10,
    top1Accuracy: percent(top1, total),
    top3Accuracy: percent(top3, total),
    top10Accuracy: percent(top10, total),
    changedDecisions: rows.filter(row => row.changedDecision).length,
    rows: rows.map(row => ({
      fileName: row.fileName,
      expectedReference: row.expectedReference,
      previousBestReference: row.previousBestReference,
      newBestReference: row.newBestReference,
      newBestScore: row.newBestScore,
      expectedRank: row.expectedRank,
      top1: row.top1,
      top3: row.top3,
      changedDecision: row.changedDecision
    }))
  };
}

function rescoreResult(result, preset) {
  const rescored = result.topCandidates
    .map(candidate => ({ ...candidate, presetScore: scoreCandidate(candidate, preset) }))
    .sort((a, b) => b.presetScore - a.presetScore);
  const expected = String(result.expectedReference || '').toLowerCase();
  const rank = rescored.findIndex(candidate => String(candidate.reference || '').toLowerCase() === expected) + 1;
  const newBest = rescored[0] || null;

  return {
    fileName: result.fileName,
    expectedReference: result.expectedReference,
    previousBestReference: result.bestReference || null,
    newBestReference: newBest?.reference || null,
    newBestScore: round(newBest?.presetScore),
    expectedRank: rank || null,
    top1: Boolean(newBest && String(newBest.reference || '').toLowerCase() === expected),
    top3: Boolean(rank && rank <= 3),
    top10: Boolean(rank && rank <= 10),
    changedDecision: Boolean(newBest && result.bestReference && newBest.reference !== result.bestReference)
  };
}

function scoreCandidate(candidate, preset) {
  const subscores = candidate.scoreDetails?.subscores || {};
  const baseWeightTotal = sumValues(preset.base, BASE_KEYS);
  const baseScore = baseWeightTotal > 0
    ? BASE_KEYS.reduce((sum, key) => sum + score(subscores[key]) * (preset.base[key] || 0), 0) / baseWeightTotal
    : 0;
  const advancedScore = preset.advancedDetails
    ? scoreAdvanced(subscores, preset.advancedDetails)
    : score(subscores.advanced);
  return baseScore * (1 - preset.advancedWeight) + advancedScore * preset.advancedWeight;
}

function scoreAdvanced(subscores, weights) {
  const total = sumValues(weights, ADVANCED_KEYS);
  if (total <= 0) return 0;
  const raw = ADVANCED_KEYS.reduce((sum, key) => sum + score(subscores[key]) * (weights[key] || 0), 0) / total;
  return raw * score(subscores.ratioGate, 100) / 100;
}

function sumValues(source, keys) {
  return keys.reduce((sum, key) => sum + Math.max(0, Number(source?.[key]) || 0), 0);
}

function score(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function percent(value, total) {
  return total > 0 ? round((value / total) * 100) : 0;
}

function round(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
}
