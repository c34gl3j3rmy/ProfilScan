import { renderResults } from '../render-results.js';

export function createCropController({ state, dom, analyzeImage }) {
  function exitCropMode() {
    state.crop.mode = false;
    state.crop.start = null;
    state.crop.box = null;
    state.crop.dragging = false;

    if (dom.cropImageButton) dom.cropImageButton.textContent = 'Recadrer';
    dom.resultCanvas?.classList.remove('crop-mode');
  }

  async function toggleCropMode() {
    if (!state.lastResult || !dom.resultCanvas) return;

    state.crop.mode = !state.crop.mode;
    state.crop.start = null;
    state.crop.box = null;

    dom.cropImageButton.textContent =
      state.crop.mode ? 'Valider recadrage' : 'Recadrer';

    dom.resultCanvas.classList.toggle('crop-mode', state.crop.mode);

    if (!state.crop.mode && state.sourceImage) {
      await applyCropAndAnalyze();
    }
  }

  function canvasPoint(event) {
    const rect = dom.resultCanvas.getBoundingClientRect();
    const scaleX = dom.resultCanvas.width / rect.width;
    const scaleY = dom.resultCanvas.height / rect.height;

    return {
      x: Math.round((event.clientX - rect.left) * scaleX),
      y: Math.round((event.clientY - rect.top) * scaleY)
    };
  }

  function normalizeCropBox(a, b) {
    const x = Math.max(0, Math.min(a.x, b.x));
    const y = Math.max(0, Math.min(a.y, b.y));
    const right = Math.min(dom.resultCanvas.width, Math.max(a.x, b.x));
    const bottom = Math.min(dom.resultCanvas.height, Math.max(a.y, b.y));

    return {
      x,
      y,
      width: Math.max(1, right - x),
      height: Math.max(1, bottom - y)
    };
  }

  function drawCropOverlay(box) {
    if (!box) return;

    const ctx = dom.resultCanvas.getContext('2d');
    ctx.save();
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = Math.max(2, dom.resultCanvas.width / 220);
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(box.x, box.y, box.width, box.height);
    ctx.restore();
  }

  function onPointerDown(event) {
    if (!state.crop.mode) return;

    state.crop.dragging = true;
    state.crop.start = canvasPoint(event);
    state.crop.box = {
      x: state.crop.start.x,
      y: state.crop.start.y,
      width: 1,
      height: 1
    };
  }

  function onPointerMove(event) {
    if (!state.crop.mode || !state.crop.dragging || !state.crop.start) return;

    state.crop.box = normalizeCropBox(state.crop.start, canvasPoint(event));
    renderResults(state.lastResult);
    drawCropOverlay(state.crop.box);
  }

  function onPointerUp() {
    state.crop.dragging = false;
  }

  async function applyCropAndAnalyze() {
    const box = state.crop.box;

    if (
      !box
      || box.width < 20
      || box.height < 20
      || !state.sourceImage
    ) {
      return;
    }

    const canvas = new OffscreenCanvas(box.width, box.height);
    const ctx = canvas.getContext('2d');

    ctx.drawImage(
      state.sourceImage,
      box.x,
      box.y,
      box.width,
      box.height,
      0,
      0,
      box.width,
      box.height
    );

    await analyzeImage(canvas.transferToImageBitmap());
  }

  function bind() {
    dom.cropImageButton?.addEventListener('click', toggleCropMode);
    dom.resultCanvas?.addEventListener('pointerdown', onPointerDown);
    dom.resultCanvas?.addEventListener('pointermove', onPointerMove);
    dom.resultCanvas?.addEventListener('pointerup', onPointerUp);
    dom.resultCanvas?.addEventListener('pointerleave', onPointerUp);
  }

  return { bind, exitCropMode };
}
