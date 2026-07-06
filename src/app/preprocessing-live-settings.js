const SETTINGS = [
  { inputId: 'blurRadiusInput', outputId: 'blurRadiusValue', format: value => value },
  { inputId: 'textureSuppressionInput', outputId: 'textureSuppressionValue', format: value => value }
];

for (const setting of SETTINGS) bindPreprocessingSetting(setting);

function bindPreprocessingSetting({ inputId, outputId, format }) {
  const input = document.querySelector(`#${inputId}`);
  const output = document.querySelector(`#${outputId}`);
  if (!input) return;

  const sync = () => {
    if (output) output.textContent = format(Number(input.value));
    triggerLiveAnalysis();
  };

  input.addEventListener('input', sync, { passive: true });
  if (output) output.textContent = format(Number(input.value));
}

function triggerLiveAnalysis() {
  const proxyInput = document.querySelector('#edgeQuantileInput');
  proxyInput?.dispatchEvent(new Event('input', { bubbles: true }));
}
