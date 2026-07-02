export const SETTINGS_PRESETS = {
  atelier: {
    label: 'Atelier',
    values: {
      brightnessInput: 10,
      contrastInput: 135,
      edgeQuantileInput: 78,
      linkRadiusInput: 7,
      minAreaInput: 6,
      mergeGapInput: 55
    }
  },
  fondClair: {
    label: 'Fond clair',
    values: {
      brightnessInput: 0,
      contrastInput: 125,
      edgeQuantileInput: 82,
      linkRadiusInput: 5,
      minAreaInput: 7,
      mergeGapInput: 45
    }
  },
  faibleLumiere: {
    label: 'Faible luminosite',
    values: {
      brightnessInput: 35,
      contrastInput: 160,
      edgeQuantileInput: 74,
      linkRadiusInput: 8,
      minAreaInput: 5,
      mergeGapInput: 65
    }
  },
  ecran: {
    label: 'Ecran PC',
    values: {
      brightnessInput: -5,
      contrastInput: 115,
      edgeQuantileInput: 86,
      linkRadiusInput: 4,
      minAreaInput: 8,
      mergeGapInput: 35
    }
  }
};

export function installPresetButtons(container, onPresetApplied) {
  if (!container || container.dataset.presetsReady === '1') return;
  container.dataset.presetsReady = '1';

  const panel = document.createElement('div');
  panel.className = 'preset-panel';
  panel.innerHTML = '<h3>Presets</h3>';

  for (const [key, preset] of Object.entries(SETTINGS_PRESETS)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button ghost preset-button';
    button.textContent = preset.label;
    button.addEventListener('click', () => {
      applyPreset(key);
      if (typeof onPresetApplied === 'function') onPresetApplied(key);
    });
    panel.appendChild(button);
  }

  container.insertBefore(panel, container.firstElementChild?.nextSibling || container.firstChild);
}

export function applyPreset(key) {
  const preset = SETTINGS_PRESETS[key];
  if (!preset) return false;

  for (const [inputId, value] of Object.entries(preset.values)) {
    const input = document.querySelector(`#${inputId}`);
    if (!input) continue;
    input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  return true;
}
