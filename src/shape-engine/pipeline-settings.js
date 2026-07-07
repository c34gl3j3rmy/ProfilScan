export const PIPELINE_VERSION = 'common-pipeline-v2';

export const DEFAULT_PIPELINE_SETTINGS = Object.freeze({
  fillGridSize: 96,
  contourPointCount: 240,
  sampleMaxSegmentLength: 0.8,
  radialBins: 64,
  fourierTerms: 16,
  angleBins: 16,
  simplifyEpsilon: 0.01,
  huSource: 'filled-mask'
});

export function normalizePipelineSettings(settings = {}) {
  return {
    version: PIPELINE_VERSION,
    fillGridSize: clampInteger(settings.fillGridSize, DEFAULT_PIPELINE_SETTINGS.fillGridSize, 32, 256),
    contourPointCount: clampInteger(settings.contourPointCount, DEFAULT_PIPELINE_SETTINGS.contourPointCount, 80, 800),
    sampleMaxSegmentLength: clampNumber(settings.sampleMaxSegmentLength, DEFAULT_PIPELINE_SETTINGS.sampleMaxSegmentLength, 0.1, 5),
    radialBins: clampInteger(settings.radialBins, DEFAULT_PIPELINE_SETTINGS.radialBins, 16, 128),
    fourierTerms: clampInteger(settings.fourierTerms, DEFAULT_PIPELINE_SETTINGS.fourierTerms, 4, 32),
    angleBins: clampInteger(settings.angleBins, DEFAULT_PIPELINE_SETTINGS.angleBins, 8, 64),
    simplifyEpsilon: clampNumber(settings.simplifyEpsilon, DEFAULT_PIPELINE_SETTINGS.simplifyEpsilon, 0, 0.08),
    huSource: 'filled-mask'
  };
}

function clampInteger(value, fallback, min, max) {
  return Math.round(clampNumber(value, fallback, min, max));
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}
