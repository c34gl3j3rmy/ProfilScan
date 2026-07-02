export async function startCamera(videoElement) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' } },
    audio: false
  });
  videoElement.srcObject = stream;
  await videoElement.play();
}

export function stopCamera(videoElement) {
  const stream = videoElement.srcObject;
  if (stream) stream.getTracks().forEach(track => track.stop());
  videoElement.srcObject = null;
}

export async function captureFrame(videoElement) {
  const canvas = document.createElement('canvas');
  canvas.width = videoElement.videoWidth;
  canvas.height = videoElement.videoHeight;
  canvas.getContext('2d').drawImage(videoElement, 0, 0);
  return createImageBitmap(canvas);
}
