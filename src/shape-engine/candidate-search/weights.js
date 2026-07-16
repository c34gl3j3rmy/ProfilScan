export const DEFAULT_WEIGHTS = {
  ratio: 0.24, radial: 0.28, hu: 0, fourier: 0.10, angle: 0.22,
  fill: 0.03, minutiae: 0.10, localFeature: 0.13, advanced: 0.25
};

const DEFAULT_UI_WEIGHTS = {
  ratio: 18, radial: 32, hu: 0, fourier: 8, angle: 28,
  fill: 4, minutiae: 10, localFeature: 14
};

export const ADVANCED_WEIGHTS = {
  hausdorff: 0.45, shapeContext: 0.10, icp: 0.30, ransac: 0, zernike: 0.15
};

export const GLOBAL_WEIGHT_KEYS = ['ratio', 'radial', 'fourier', 'angle', 'fill'];
export const LOCAL_WEIGHT_KEYS = ['minutiae', 'localFeature'];
const BASE_WEIGHT_KEYS = [...GLOBAL_WEIGHT_KEYS, ...LOCAL_WEIGHT_KEYS];
const REPORT_ONLY_KEYS = ['hu'];

export function normalizeWeights(weights) {
  const baseWeights = Object.fromEntries(BASE_WEIGHT_KEYS.map(key => [key, positiveWeight(weights, key)]));
  const baseTotal = Object.values(baseWeights).reduce((sum, value) => sum + value, 0);
  const fallbackTotal = BASE_WEIGHT_KEYS.reduce((sum, key) => sum + DEFAULT_WEIGHTS[key], 0);

  const normalizedBase = Object.fromEntries(BASE_WEIGHT_KEYS.map(key => {
    const value = baseTotal > 0 ? baseWeights[key] / baseTotal : DEFAULT_WEIGHTS[key] / fallbackTotal;
    return [key, value];
  }));

  return {
    ...normalizedBase,
    hu: 0,
    advanced: clampUnit(Number.isFinite(Number(weights?.advanced)) ? Number(weights.advanced) : DEFAULT_WEIGHTS.advanced)
  };
}

export function isNormalizedWeightSet(weights) {
  if (!weights) return false;
  return BASE_WEIGHT_KEYS.every(key => Number.isFinite(weights[key])) && REPORT_ONLY_KEYS.every(key => Number.isFinite(weights[key])) && Number.isFinite(weights.advanced);
}

function positiveWeight(weights, key) {
  const number = Number(weights?.[key]);
  if (Number.isFinite(number) && number > 0) return number;
  if (isUiWeightSet(weights)) return DEFAULT_UI_WEIGHTS[key] || 0;
  return DEFAULT_WEIGHTS[key] || 0;
}

function isUiWeightSet(weights) {
  if (!weights) return false;
  return [...BASE_WEIGHT_KEYS, ...REPORT_ONLY_KEYS].some(key => Number(weights?.[key]) > 1);
}

function clampUnit(value) {
  return Math.max(0, Math.min(0.75, value));
}
