import {
  startCamera,
  stopCamera,
  captureFrame
} from '../camera.js';

export function createCameraController({
  dom,
  navigation,
  progress,
  analyzeImage
}) {
  async function openCamera() {
    try {
      navigation.show('camera');
      await startCamera(dom.video);
    } catch (error) {
      progress.showError(error, 'home');
    }
  }

  async function capture() {
    try {
      const frame = await captureFrame(dom.video);
      stopCamera(dom.video);
      await analyzeImage(frame);
    } catch (error) {
      progress.showError(error, 'home');
    }
  }

  function cancel() {
    stopCamera(dom.video);
    navigation.goBackSafe();
  }

  function stop() {
    stopCamera(dom.video);
  }

  return { openCamera, capture, cancel, stop };
}
