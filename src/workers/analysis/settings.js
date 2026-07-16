import { normalizePipelineSettings } from '../../shape-engine/pipeline-settings.js';

const DEFAULT_SETTINGS = {
  image: {
    brightness: 0,
    contrast: 100,
    blurRadius: 1,
    textureSuppression: 0
  },
  detection: {
    edgeQuantile: 0.82,
    linkRadius: 5,
    minAreaRatio: 0.0007,
    mergeGapRatio: 0.045
  },
  weights: {
    ratio: 18,
    radial: 32,
    hu: 0,
    fourier: 8,
    angle: 28,
    fill: 4,
    minutiae: 10,
    localFeature: 14
  },
  pipelineSettings: null
};

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(min, Math.min(max, number))
    : fallback;
}

export function mergeAnalysisSettings(settings = {}, collection = null) {
  return {
    expectedReference: String(settings.expectedReference || '').trim(),
    inputMode:
      settings.inputMode === 'filled-material'
        ? 'filled-material'
        : 'edge-photo',

    image: {
      brightness: clampNumber(
        settings.image?.brightness,
        DEFAULT_SETTINGS.image.brightness,
        -100,
        100
      ),
      contrast: clampNumber(
        settings.image?.contrast,
        DEFAULT_SETTINGS.image.contrast,
        0,
        220
      ),
      blurRadius: Math.round(clampNumber(
        settings.image?.blurRadius,
        DEFAULT_SETTINGS.image.blurRadius,
        0,
        5
      )),
      textureSuppression: Math.round(clampNumber(
        settings.image?.textureSuppression,
        DEFAULT_SETTINGS.image.textureSuppression,
        0,
        6
      ))
    },

    detection: {
      edgeQuantile: clampNumber(
        settings.detection?.edgeQuantile,
        DEFAULT_SETTINGS.detection.edgeQuantile,
        0.01,
        0.99
      ),
      linkRadius: Math.round(clampNumber(
        settings.detection?.linkRadius,
        DEFAULT_SETTINGS.detection.linkRadius,
        1,
        50
      )),
      minAreaRatio: clampNumber(
        settings.detection?.minAreaRatio,
        DEFAULT_SETTINGS.detection.minAreaRatio,
        0,
        0.05
      ),
      mergeGapRatio: clampNumber(
        settings.detection?.mergeGapRatio,
        DEFAULT_SETTINGS.detection.mergeGapRatio,
        0.001,
        0.12
      )
    },

    weights: {
      ratio: clampNumber(
        settings.weights?.ratio,
        DEFAULT_SETTINGS.weights.ratio,
        0,
        100
      ),
      radial: clampNumber(
        settings.weights?.radial,
        DEFAULT_SETTINGS.weights.radial,
        0,
        100
      ),
      hu: 0,
      fourier: clampNumber(
        settings.weights?.fourier,
        DEFAULT_SETTINGS.weights.fourier,
        0,
        100
      ),
      angle: clampNumber(
        settings.weights?.angle,
        DEFAULT_SETTINGS.weights.angle,
        0,
        100
      ),
      fill: clampNumber(
        settings.weights?.fill,
        DEFAULT_SETTINGS.weights.fill,
        0,
        100
      ),
      minutiae: clampNumber(
        settings.weights?.minutiae,
        DEFAULT_SETTINGS.weights.minutiae,
        0,
        100
      ),
      localFeature: clampNumber(
        settings.weights?.localFeature,
        DEFAULT_SETTINGS.weights.localFeature,
        0,
        100
      )
    },

    pipelineSettings: normalizePipelineSettings(
      settings.pipelineSettings
      || collection?.pipelineSettings
      || {}
    )
  };
}

export function useInputMode(settings) {
  return settings.inputMode === 'filled-material'
    || settings.expectedReference
    ? 'filled-material'
    : 'edge-photo';
}
