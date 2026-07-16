import { bindRange } from './settings-reader.js';

export function createDom() {
  const byId = id => document.querySelector(`#${id}`);

  return {
    screens: {
      noBase: byId('screenNoBase'),
      home: byId('screenHome'),
      camera: byId('screenCamera'),
      analysis: byId('screenAnalysis'),
      result: byId('screenResult'),
      signature: byId('screenSignature'),
      pipelineSettings: byId('screenPipelineSettings')
    },

    baseStatus: byId('baseStatus'),
    profileDbInput: byId('profileDbInput'),
    replaceProfileDbInput: byId('replaceProfileDbInput'),
    imageInput: byId('imageInput'),
    cameraButton: byId('cameraButton'),
    captureButton: byId('captureButton'),
    cancelCameraButton: byId('cancelCameraButton'),
    newAnalysisButton: byId('newAnalysisButton'),
    signatureDebugButton: byId('signatureDebugButton'),
    pipelineSettingsButton: byId('pipelineSettingsButton'),
    pipelineReferenceInput: byId('pipelineReferenceInput'),
    pipelineRandomProfileButton: byId('pipelineRandomProfileButton'),
    pipelineShowProfileButton: byId('pipelineShowProfileButton'),
    pipelinePreviewCanvas: byId('pipelinePreviewCanvas'),
    pipelinePreviewStatus: byId('pipelinePreviewStatus'),
    pipelinePreviewOutput: byId('pipelinePreviewOutput'),
    closePipelineSettingsButton: byId('closePipelineSettingsButton'),
    signatureSearchInput: byId('signatureSearchInput'),
    expectedProfileInput: byId('expectedProfileInput'),
    profileReferenceList: byId('profileReferenceList'),
    showSignatureButton: byId('showSignatureButton'),
    copySignatureButton: byId('copySignatureButton'),
    copyAnalysisReportButton: byId('copyAnalysisReportButton'),
    closeSignatureButton: byId('closeSignatureButton'),
    signatureOutput: byId('signatureOutput'),
    visionPanel: byId('resultVisionPanel'),
    compactVisionButton: byId('compactVisionButton'),
    cropImageButton: byId('cropImageButton'),
    autoSettingsButton: byId('autoSettingsButton'),
    resultCanvas: byId('resultCanvas'),
    video: byId('cameraPreview'),
    analysisStatus: byId('analysisStatus'),
    analysisProgress: byId('analysisProgress'),
    analysisPercent: byId('analysisPercent'),
    analysisDetails: byId('analysisDetails'),
    detectedCount: byId('detectedCount'),

    inputs: {
      brightness: bindRange('brightnessInput', 'brightnessValue', value => value),
      contrast: bindRange('contrastInput', 'contrastValue', value => value),
      edgeQuantile: bindRange('edgeQuantileInput', 'edgeQuantileValue', value => value),
      linkRadius: bindRange('linkRadiusInput', 'linkRadiusValue', value => value),
      minArea: bindRange('minAreaInput', 'minAreaValue', value => (value / 100).toFixed(2)),
      mergeGap: bindRange('mergeGapInput', 'mergeGapValue', value => (value / 10).toFixed(1)),
      weightRatio: bindRange('weightRatioInput', 'weightRatioValue', value => value),
      weightRadial: bindRange('weightRadialInput', 'weightRadialValue', value => value),
      weightHu: bindRange('weightHuInput', 'weightHuValue', value => value),
      weightFourier: bindRange('weightFourierInput', 'weightFourierValue', value => value),
      weightAngle: bindRange('weightAngleInput', 'weightAngleValue', value => value),
      weightFill: bindRange('weightFillInput', 'weightFillValue', value => value)
    },

    pipelineInputs: {
      fillGridSize: bindRange('pipelineFillGridInput', 'pipelineFillGridValue', value => value),
      contourPointCount: bindRange('pipelineContourPointInput', 'pipelineContourPointValue', value => value),
      simplifyEpsilon: bindRange(
        'pipelineSimplifyInput',
        'pipelineSimplifyValue',
        value => (value / 1000).toFixed(3)
      )
    }
  };
}
