export const WEIGHT_PRESETS = [
  {
    name: 'actuel-interface-sans-hu',
    description: 'Configuration candidate issue du benchmark : poids interface historiques, Hu ignore, EFD et structural conserves en audit',
    status: 'candidate',
    benchmarkReference: {
      top1Accuracy: 97.81,
      previousTop1Accuracy: 96.35,
      regressions: 0
    },
    base: {
      ratio: 25,
      radial: 22,
      fourier: 18,
      efd