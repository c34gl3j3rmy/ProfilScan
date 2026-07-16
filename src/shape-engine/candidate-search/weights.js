export const DEFAULT_WEIGHTS = {
  ratio: 0.24,
  radial: 0.28,
  hu: 0,
  fourier: 0.10,
  angle: 0.22,
  fill: 0.03,
  minutiae: 0.10,
  localFeature: 0.13,
  advanced: 0.25
};

const DEFAULT_UI_WEIGHTS = {
  ratio: 18,
  radial: 32,
  hu: 0,
  fourier: 8,
  angle: 28,
  fill: 4,
  minutiae: 10,
  localFeature: 14
};

export const GLOBAL_WEIGHT_KEYS = ['ratio', 'radial', 'fourier', 'angle', 'fill'];
export const LOCAL_WEIGHT_KEYS = ['min