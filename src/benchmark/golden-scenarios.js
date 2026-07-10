export const GOLDEN_DATASET_VERSION = '1.0.0';

export const GOLDEN_SCENARIOS = Object.freeze([
  scenario({
    id: 'A-svg-direct',
    level: 'A',
    inputMode: 'svg-direct',
    seed: 1001,
    transforms: [],
    thresholds: strictThresholds(100, 100, 100, 0)
  }),
  scenario({
    id: 'A-svg-raster-clean',
    level: 'A',
    inputMode: 'svg-raster-filled-material',
    seed: 1002,
    transforms: [],
    thresholds: strictThresholds(99, 100, 100, 0)
  }),
  scenario({
    id: 'A-rotate-90',
    level: 'A',
    inputMode: 'svg-raster-filled-material',
    seed: 1003,
    transforms: [{ type: 'rotate', degrees: 90 }],
    thresholds: strictThresholds(99, 100, 100, 0)
  }),
  scenario({
    id: 'A-scale-clean',
    level: 'A',
    inputMode: 'svg-raster-filled-material',
    seed: 1004,
    transforms: [{ type: 'scale', factor: 0.72 }],
    thresholds: strictThresholds(99, 100, 100, 0)
  }),
  scenario({
    id: 'B-rotation-free-light',
    level: 'B',
    inputMode: 'photo-edge',
    seed: 2001,
    transforms: [{ type: 'rotate', degreesRange: [-12, 12] }],
    thresholds: strictThresholds(97, 99, 100, 1)
  }),
  scenario({
    id: 'B-blur-light',
    level: 'B',
    inputMode: 'photo-edge',
    seed: 2002,
    transforms: [{ type: 'gaussian-blur', sigmaRange: [0.4, 1.2] }],
    thresholds: strictThresholds(97, 99, 100, 1)
  }),
  scenario({
    id: 'B-noise-light',
    level: 'B',
    inputMode: 'photo-edge',
    seed: 2003,
    transforms: [{ type: 'gaussian-noise', sigmaRange: [1, 5] }],
    thresholds: strictThresholds(97, 99, 100, 1)
  }),
  scenario({
    id: 'B-low-contrast-light',
    level: 'B',
    inputMode: 'photo-edge',
    seed: 2004,
    transforms: [{ type: 'contrast', factorRange: [0.72, 0.9] }],
    thresholds: strictThresholds(97, 99, 100, 1)
  }),
  scenario({
    id: 'B-resize-subpixel',
    level: 'B',
    inputMode: 'photo-edge',
    seed: 2005,
    transforms: [{ type: 'resize', factorRange: [0.65, 1.35], interpolation: 'bilinear' }],
    thresholds: strictThresholds(97, 99, 100, 1)
  }),
  scenario({
    id: 'C-perspective-moderate',
    level: 'C',
    inputMode: 'photo-edge',
    seed: 3001,
    transforms: [{ type: 'perspective', maxCornerShiftRatio: 0.08 }],
    thresholds: strictThresholds(90, 97, 99, 3)
  }),
  scenario({
    id: 'C-lighting-gradient',
    level: 'C',
    inputMode: 'photo-edge',
    seed: 3002,
    transforms: [{ type: 'lighting-gradient', amplitudeRange: [0.12, 0.28] }],
    thresholds: strictThresholds(90, 97, 99, 3)
  }),
  scenario({
    id: 'C-background-simple',
    level: 'C',
    inputMode: 'photo-edge',
    seed: 3003,
    transforms: [{ type: 'background', preset: 'simple-texture' }],
    thresholds: strictThresholds(90, 97, 99, 3)
  }),
  scenario({
    id: 'C-compression',
    level: 'C',
    inputMode: 'photo-edge',
    seed: 3004,
    transforms: [{ type: 'jpeg-compression', qualityRange: [45, 75] }],
    thresholds: strictThresholds(90, 97, 99, 3)
  }),
  scenario({
    id: 'C-reflection-moderate',
    level: 'C',
    inputMode: 'photo-edge',
    seed: 3005,
    transforms: [{ type: 'specular-highlight', coverageRange: [0.02, 0.08], intensityRange: [0.12, 0.28] }],
    thresholds: strictThresholds(90, 97, 99, 3)
  }),
  scenario({
    id: 'D-perspective-strong',
    level: 'D',
    inputMode: 'photo-edge',
    seed: 4001,
    transforms: [{ type: 'perspective', maxCornerShiftRatio: 0.18 }],
    thresholds: observationalThresholds()
  }),
  scenario({
    id: 'D-background-cluttered',
    level: 'D',
    inputMode: 'photo-edge',
    seed: 4002,
    transforms: [{ type: 'background', preset: 'cluttered' }],
    thresholds: observationalThresholds()
  }),
  scenario({
    id: 'D-occlusion-partial',
    level: 'D',
    inputMode: 'photo-edge',
    seed: 4003,
    transforms: [{ type: 'occlusion', coverageRange: [0.05, 0.2] }],
    thresholds: observationalThresholds()
  }),
  scenario({
    id: 'D-crop-partial',
    level: 'D',
    inputMode: 'photo-edge',
    seed: 4004,
    transforms: [{ type: 'crop', coverageRange: [0.02, 0.12] }],
    thresholds: observationalThresholds()
  })
]);

export function getGoldenScenario(id) {
  return GOLDEN_SCENARIOS.find(item => item.id === id) || null;
}

export function listGoldenScenarios({ level = null, inputMode = null } = {}) {
  return GOLDEN_SCENARIOS.filter(item => {
    if (level && item.level !== level) return false;
    if (inputMode && item.inputMode !== inputMode) return false;
    return true;
  });
}

export function validateGoldenScenario(value) {
  const errors = [];
  if (!value || typeof value !== 'object') return ['scenario-missing'];
  if (!value.id || typeof value.id !== 'string') errors.push('id-invalid');
  if (!['A', 'B', 'C', 'D'].includes(value.level)) errors.push('level-invalid');
  if (!['svg-direct', 'svg-raster-filled-material', 'photo-edge'].includes(value.inputMode)) errors.push('input-mode-invalid');
  if (!Number.isInteger(value.seed)) errors.push('seed-invalid');
  if (!Array.isArray(value.transforms)) errors.push('transforms-invalid');
  if (!value.thresholds || typeof value.thresholds !== 'object') errors.push('thresholds-invalid');
  return errors;
}

export function createDeterministicRandom(seed) {
  let state = Number(seed) >>> 0;
  return function random() {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function scenario({ id, level, inputMode, seed, transforms, thresholds }) {
  return Object.freeze({
    id,
    version: GOLDEN_DATASET_VERSION,
    level,
    inputMode,
    seed,
    transforms: Object.freeze(transforms.map(transform => Object.freeze({ ...transform }))),
    thresholds: Object.freeze({ ...thresholds })
  });
}

function strictThresholds(top1, top3, top10, maxNonDetectionPercent) {
  return {
    mode: 'blocking',
    top1Percent: top1,
    top3Percent: top3,
    top10Percent: top10,
    maxNonDetectionPercent,
    maxReportSizeBytes: 1_000_000
  };
}

function observationalThresholds() {
  return {
    mode: 'observational',
    maxReportSizeBytes: 1_000_000
  };
}
