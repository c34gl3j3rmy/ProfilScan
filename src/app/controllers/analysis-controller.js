import { buildSettings } from '../settings-reader.js';
import {
  computeAutoImageSettings,
  applyAutoImageSettings
} from '../auto-settings.js';
import { renderResults } from '../render-results.js';
import { formatError } from '../shared/common-utils.js';
import { createWorkerClient } from '../shared/worker-client.js';

export function createAnalysisController({
  state,
  dom,
  navigation,
  progress,
  exitCropMode
}) {
  const client = createWorkerClient(
    new URL('../../workers/analysis-worker.js', import.meta.url)
  );

  async function analyzeWithSettings(showProgress) {
    const settings = buildSettings(dom.inputs);
    settings.pipelineSettings = state.currentPipelineSettings;

    return client.run(
      {
        type: 'analyze',
        imageBitmap: state.sourceImage,
        collection: state.collection,
        settings
      },
      showProgress
        ? message => progress.set(message.percent, message.label, message.detail)
        : null
    );
  }

  async function applyAutoSettings(imageBitmap = state.sourceImage) {
    if (!imageBitmap) return null;

    state.lastAutoSettings = await computeAutoImageSettings(imageBitmap);
    applyAutoImageSettings(dom.inputs, state.lastAutoSettings);
    return state.lastAutoSettings;
  }

  async function analyzeImage(imageBitmap) {
    state.sourceImage = imageBitmap;
    exitCropMode();

    navigation.show('analysis');
    progress.reset('Analyse de l image');
    progress.set(6, 'Auto-reglage', 'Calcul des seuils image');

    const autoSettings = await applyAutoSettings(imageBitmap);
    progress.set(
      10,
      'Preparation de l image',
      `Seuil contour auto : ${autoSettings.edgeQuantile} %`
    );

    state.lastResult = await analyzeWithSettings(true);
    progress.set(100, 'Resultat pret', 'Affichage des detections', 'done');

    renderResults(state.lastResult);
    navigation.show('result', { replace: true });
  }

  async function rerunAutoSettings() {
    if (!state.sourceImage || !dom.autoSettingsButton) return;

    try {
      dom.autoSettingsButton.textContent = 'Calcul auto...';
      const autoSettings = await applyAutoSettings();

      if (dom.detectedCount) {
        dom.detectedCount.textContent =
          `Reglage auto : seuil ${autoSettings.edgeQuantile} %`;
      }

      state.lastResult = await analyzeWithSettings(false);
      renderResults(state.lastResult);

      dom.autoSettingsButton.textContent = 'Reglage auto applique';
      setTimeout(() => {
        dom.autoSettingsButton.textContent = 'Reglage auto';
      }, 1200);
    } catch (error) {
      dom.autoSettingsButton.textContent = 'Erreur reglage auto';
      if (dom.detectedCount) {
        dom.detectedCount.textContent =
          `Erreur reglage auto : ${formatError(error)}`;
      }
      setTimeout(() => {
        dom.autoSettingsButton.textContent = 'Reglage auto';
      }, 1600);
    }
  }

  function scheduleLiveAnalysis() {
    if (!state.sourceImage || dom.screens.result?.classList.contains('hidden')) {
      return;
    }

    clearTimeout(state.liveTimer);
    const run = ++state.liveRun;

    state.liveTimer = setTimeout(async () => {
      try {
        if (dom.detectedCount) {
          dom.detectedCount.textContent = 'Recalcul en direct...';
        }

        const result = await analyzeWithSettings(false);

        if (run === state.liveRun) {
          state.lastResult = result;
          renderResults(result);
        }
      } catch (error) {
        if (dom.detectedCount) {
          dom.detectedCount.textContent =
            `Erreur recalcul : ${formatError(error)}`;
        }
      }
    }, 180);
  }

  return {
    analyzeImage,
    rerunAutoSettings,
    scheduleLiveAnalysis
  };
}
