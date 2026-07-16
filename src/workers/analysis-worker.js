import { mergeAnalysisSettings } from './analysis/settings.js';
import { runAnalysis } from './analysis/run-analysis.js';

function postProgress(percent, label, detail) {
  self.postMessage({
    type: 'progress',
    percent,
    label,
    detail
  });
}

self.onmessage = async event => {
  const {
    type,
    imageBitmap,
    collection,
    settings
  } = event.data;

  if (type !== 'analyze') return;

  const activeSettings = mergeAnalysisSettings(
    settings,
    collection
  );

  try {
    const result = await runAnalysis({
      imageBitmap,
      collection,
      activeSettings,
      postProgress
    });

    self.postMessage(
      result,
      [imageBitmap]
    );
  } catch (error) {
    self.postMessage({
      type: 'error',
      message:
        error instanceof Error
          ? error.message
          : String(error)
    });
  }
};
