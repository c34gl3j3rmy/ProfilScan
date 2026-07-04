const IMAGE_INPUT_IDS = ['brightnessInput', 'contrastInput'];

for (const id of IMAGE_INPUT_IDS) {
  const input = document.querySelector(`#${id}`);
  input?.addEventListener('input', updateCanvasFilter, { passive: true });
}

function updateCanvasFilter() {
  const canvas = document.querySelector('#resultCanvas');
  if (!canvas || canvas.closest('.hidden')) return;

  const brightness = Number(document.querySelector('#brightnessInput')?.value || 0);
  const contrast = Number(document.querySelector('#contrastInput')?.value || 100);
  canvas.style.filter = `brightness(${Math.max(0, 100 + brightness)}%) contrast(${Math.max(0, contrast)}%)`;

  const status = document.querySelector('#detectedCount');
  if (status) status.textContent = 'Apercu image immediat - recalcul contours en cours...';
}
