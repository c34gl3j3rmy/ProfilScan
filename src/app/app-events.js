import { loadImageFile } from './image-import.js';

export function bindAppEvents({
  dom,
  navigation,
  importController,
  analysisController,
  cropController,
  signatureController,
  pipelineController,
  cameraController,
  progress
}) {
  Object.values(dom.inputs).forEach(input => {
    input?.addEventListener('input', analysisController.scheduleLiveAnalysis);
  });

  Object.values(dom.pipelineInputs).forEach(input => {
    input?.addEventListener('input', pipelineController.schedulePipelinePreview);
  });

  dom.profileDbInput?.addEventListener(
    'change',
    event => importController.importBaseFromFile(event.target.files?.[0])
  );

  dom.replaceProfileDbInput?.addEventListener(
    'change',
    event => importController.importBaseFromFile(event.target.files?.[0])
  );

  dom.imageInput?.addEventListener('change', event => {
    const file = event.target.files?.[0];
    if (!file) return;

    loadImageFile(file)
      .then(analysisController.analyzeImage)
      .catch(error => progress.showError(error, 'home'));

    event.target.value = '';
  });

  dom.cameraButton?.addEventListener('click', cameraController.openCamera);
  dom.captureButton?.addEventListener('click', cameraController.capture);
  dom.cancelCameraButton?.addEventListener('click', cameraController.cancel);

  dom.newAnalysisButton?.addEventListener(
    'click',
    () => navigation.show('home')
  );

  dom.signatureDebugButton?.addEventListener(
    'click',
    signatureController.openSignatureScreen
  );
  dom.showSignatureButton?.addEventListener(
    'click',
    signatureController.showSignature
  );
  dom.copySignatureButton?.addEventListener(
    'click',
    signatureController.copySignatureOutput
  );
  dom.copyAnalysisReportButton?.addEventListener(
    'click',
    signatureController.copyAnalysisReport
  );
  dom.closeSignatureButton?.addEventListener(
    'click',
    navigation.goBackSafe
  );

  dom.compactVisionButton?.addEventListener('click', () => {
    dom.visionPanel?.classList.toggle('compact');
    const active = dom.visionPanel?.classList.contains('compact');
    dom.compactVisionButton.textContent =
      active ? 'Image normale' : 'Image compacte';
  });

  dom.autoSettingsButton?.addEventListener(
    'click',
    analysisController.rerunAutoSettings
  );

  dom.pipelineSettingsButton?.addEventListener(
    'click',
    pipelineController.openScreen
  );
  dom.pipelineRandomProfileButton?.addEventListener(
    'click',
    pipelineController.selectRandomProfile
  );
  dom.pipelineShowProfileButton?.addEventListener(
    'click',
    pipelineController.updatePreview
  );
  dom.pipelineReferenceInput?.addEventListener(
    'input',
    pipelineController.schedulePipelinePreview
  );
  dom.closePipelineSettingsButton?.addEventListener(
    'click',
    navigation.goBackSafe
  );

  cropController.bind();
}
