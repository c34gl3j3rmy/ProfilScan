import { getCollection } from '../storage/indexed-db.js';
import {
  DEFAULT_PIPELINE_SETTINGS,
  normalizePipelineSettings
} from '../shape-engine/pipeline-settings.js';
import { createDom } from './app-dom.js';
import { createAppState } from './app-state.js';
import { createNavigation } from './app-navigation.js';
import { createProgress } from './app-progress.js';
import { populateProfileReferenceList } from './profile-utils.js';
import { createAnalysisController } from './controllers/analysis-controller.js';
import { createCameraController } from './controllers/camera-controller.js';
import { createCropController } from './controllers/crop-controller.js';
import { createImportController } from './controllers/import-controller.js';
import { createPipelineController } from './controllers/pipeline-controller.js';
import { createSignatureController } from './controllers/signature-controller.js';
import { bindAppEvents } from './app-events.js';

export async function bootApplication() {
  const state = createAppState();
  const dom = createDom();

  let cameraController;
  let cropController;

  const navigation = createNavigation({
    state,
    dom,
    onLeaveCamera: () => cameraController?.stop(),
    onLeaveResult: () => cropController?.exitCropMode()
  });

  const progress = createProgress({ dom, navigation });

  const analysisController = createAnalysisController({
    state,
    dom,
    navigation,
    progress,
    exitCropMode: () => cropController?.exitCropMode()
  });

  cropController = createCropController({
    state,
    dom,
    analyzeImage: analysisController.analyzeImage
  });

  cameraController = createCameraController({
    dom,
    navigation,
    progress,
    analyzeImage: analysisController.analyzeImage
  });

  const signatureController = createSignatureController({
    state,
    dom,
    navigation,
    getCropBox: () => state.crop.box
  });

  const pipelineController = createPipelineController({
    state,
    dom,
    navigation,
    buildSignatureExport: signatureController.buildSignatureExport,
    refreshProfileList: signatureController.refreshProfileList
  });

  const importController = createImportController({
    state,
    dom,
    navigation,
    progress,
    applyPipelineSettingsToInputs:
      pipelineController.applyPipelineSettingsToInputs,
    refreshProfileList: signatureController.refreshProfileList
  });

  bindAppEvents({
    dom,
    navigation,
    importController,
    analysisController,
    cropController,
    signatureController,
    pipelineController,
    cameraController,
    progress
  });

  navigation.bindHistory();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js');
  }

  state.collection = await getCollection();

  if (!state.collection) {
    dom.baseStatus.textContent = 'Base locale absente';
    navigation.show('noBase', { replace: true });
    return;
  }

  state.currentPipelineSettings = normalizePipelineSettings(
    state.collection.pipelineSettings || DEFAULT_PIPELINE_SETTINGS
  );

  pipelineController.applyPipelineSettingsToInputs(
    state.currentPipelineSettings,
    false
  );

  populateProfileReferenceList(
    state.collection,
    dom.profileReferenceList
  );

  dom.baseStatus.textContent =
    `Base chargee : ${state.collection.profiles.length} profils`;

  navigation.show('home', { replace: true });
}
