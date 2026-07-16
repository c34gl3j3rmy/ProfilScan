import {
  DEFAULT_PIPELINE_SETTINGS,
  normalizePipelineSettings
} from '../shape-engine/pipeline-settings.js';

export function createAppState() {
  return {
    collection: null,
    sourceImage: null,
    lastResult: null,
    lastAutoSettings: null,
    currentPipelineSettings: normalizePipelineSettings(DEFAULT_PIPELINE_SETTINGS),
    currentScreen: null,
    restoringHistory: false,
    liveTimer: null,
    liveRun: 0,
    pipelinePreviewTimer: null,
    pipelinePreviewRun: 0,
    crop: {
      mode: false,
      start: null,
      box: null,
      dragging: false
    }
  };
}
