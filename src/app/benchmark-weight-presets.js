export const WEIGHT_PRESETS = [
  {
    name: 'actuel-interface-sans-hu',
    description: 'Configuration candidate issue du benchmark : poids interface historiques, Hu ignore, EFD et structural conserves en audit',
    status: 'candidate',
    benchmarkReference: { top1Accuracy: 97.81, previousTop1Accuracy: 96.35, regressions: 0 },
    base: { ratio: 25, radial: 22, fourier: 18, efd: 0, structural: 0, angle: 10, fill: 5, minutiae: 12, localFeature: 14 },
    advancedWeight: 0.35,
    advancedDetails: null
  },
  {
    name: 'profilscan-v3',
    description: 'Hu neutralise, radial/angles/Hausdorff/ICP et signature locale renforces',
    base: { ratio: 18, radial: 30, fourier: 8, efd: 0, structural