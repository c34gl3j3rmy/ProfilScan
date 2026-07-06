export function bindRange(inputId, outputId, formatter) {
  const input = document.querySelector(`#${inputId}`);
  const output = document.querySelector(`#${outputId}`);
  if (!input || !output) return null;

  const sync = () => {
    output.textContent = formatter(Number(input.value));
  };

  input.addEventListener('input', sync);
  sync();
  return input;
}

export function buildSettings(inputs) {
  return {
    expectedReference: document.querySelector('#expectedProfileInput')?.value.trim() || '',
    image: {
      brightness: numberValue(inputs.brightness, 0),
      contrast: numberValue(inputs.contrast, 100),
      blurRadius: rangeValue('blurRadiusInput', 1),
      textureSuppression: rangeValue('textureSuppressionInput', 0)
    },
    detection: {
      edgeQuantile: numberValue(inputs.edgeQuantile, 82) / 100,
      linkRadius: numberValue(inputs.linkRadius, 5),
      minAreaRatio: numberValue(inputs.minArea, 7) / 10000,
      mergeGapRatio: numberValue(inputs.mergeGap, 45) / 1000
    },
    weights: {
      ratio: numberValue(inputs.weightRatio, 25),
      radial: numberValue(inputs.weightRadial, 22),
      hu: numberValue(inputs.weightHu, 20),
      fourier: numberValue(inputs.weightFourier, 18),
      angle: numberValue(inputs.weightAngle, 10),
      fill: numberValue(inputs.weightFill, 5)
    }
  };
}

function rangeValue(inputId, fallback) {
  const value = Number(document.querySelector(`#${inputId}`)?.value);
  return Number.isFinite(value) ? value : fallback;
}

function numberValue(input, fallback) {
  const value = Number(input?.value);
  return Number.isFinite(value) ? value : fallback;
}
