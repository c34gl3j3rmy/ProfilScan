import { buildUnifiedFingerprint } from '../../shape-engine/fingerprint-pipeline.js';
import { normalizePipelineSettings } from '../../shape-engine/pipeline-settings.js';
import { renderPipelinePreview } from '../pipeline-preview.js';
import { formatError } from '../shared/common-utils.js';
import { findProfile } from '../profile-utils.js';

export function createPipelineController({
  state,
  dom,
  navigation,
  buildSignatureExport,
  refreshProfileList
}) {
  function buildPipelineSettingsFromInputs() {
    state.currentPipelineSettings = normalizePipelineSettings({
      ...state.currentPipelineSettings,
      fillGridSize: dom.pipelineInputs.fillGridSize?.value,
      contourPointCount: dom.pipelineInputs.contourPointCount?.value,
      simplifyEpsilon:
        (Number(dom.pipelineInputs.simplifyEpsilon?.value) || 0) / 1000
    });

    return state.currentPipelineSettings;
  }

  function applyPipelineSettingsToInputs(settings, updatePreview = true) {
    const normalized = normalizePipelineSettings(settings);

    if (dom.pipelineInputs.fillGridSize) {
      dom.pipelineInputs.fillGridSize.value = normalized.fillGridSize;
    }
    if (dom.pipelineInputs.contourPointCount) {
      dom.pipelineInputs.contourPointCount.value = normalized.contourPointCount;
    }
    if (dom.pipelineInputs.simplifyEpsilon) {
      dom.pipelineInputs.simplifyEpsilon.value =
        Math.round(normalized.simplifyEpsilon * 1000);
    }

    Object.values(dom.pipelineInputs).forEach(
      input => input?.dispatchEvent(new Event('input'))
    );

    if (updatePreview && state.currentScreen === 'pipelineSettings') {
      schedulePipelinePreview();
    }
  }

  function clearPreviewCanvas() {
    if (!dom.pipelinePreviewCanvas) return;
    const ctx = dom.pipelinePreviewCanvas.getContext('2d');
    ctx.clearRect(
      0,
      0,
      dom.pipelinePreviewCanvas.width,
      dom.pipelinePreviewCanvas.height
    );
  }

  function openScreen() {
    refreshProfileList();
    applyPipelineSettingsToInputs(state.currentPipelineSettings, false);
    navigation.show('pipelineSettings');

    if (
      !dom.pipelineReferenceInput.value
      && state.collection?.profiles?.length
    ) {
      selectRandomProfile();
    } else {
      updatePreview();
    }
  }

  function schedulePipelinePreview() {
    if (state.currentScreen !== 'pipelineSettings') return;

    clearTimeout(state.pipelinePreviewTimer);
    const settings = buildPipelineSettingsFromInputs();
    const profile = findProfile(
      state.collection,
      dom.pipelineReferenceInput?.value
    ) || state.collection?.profiles?.[0];

    if (profile) {
      dom.pipelinePreviewStatus.textContent =
        `${profile.reference} - recalcul en direct...`
        + ` · grille ${settings.fillGridSize} x ${settings.fillGridSize}`;
    }

    state.pipelinePreviewTimer = setTimeout(updatePreview, 80);
  }

  function selectRandomProfile() {
    if (!state.collection?.profiles?.length) return;

    const profile = state.collection.profiles[
      Math.floor(Math.random() * state.collection.profiles.length)
    ];

    dom.pipelineReferenceInput.value = profile.reference;
    updatePreview();
  }

  async function updatePreview() {
    if (!dom.pipelinePreviewOutput) return;

    const run = ++state.pipelinePreviewRun;
    const settings = buildPipelineSettingsFromInputs();
    const profile = findProfile(
      state.collection,
      dom.pipelineReferenceInput?.value
    ) || state.collection?.profiles?.[0];

    if (!profile) {
      dom.pipelinePreviewStatus.textContent = 'Aucun profil disponible.';
      dom.pipelinePreviewOutput.value = '';
      clearPreviewCanvas();
      return;
    }

    dom.pipelinePreviewStatus.textContent =
      `${profile.reference} - ${profile.designation || 'Sans designation'}`
      + ` · calcul de l'aperçu...`;

    try {
      const fingerprint = await buildUnifiedFingerprint(
        { kind: 'profile', profile },
        settings
      );

      if (run !== state.pipelinePreviewRun) return;

      renderPipelinePreview(dom.pipelinePreviewCanvas, profile, fingerprint);

      const mode =
        fingerprint?.summary?.pipelineMode
        || fingerprint?.summary?.source
        || 'signature';

      dom.pipelinePreviewStatus.textContent =
        `${profile.reference} - ${profile.designation || 'Sans designation'}`
        + ` · ${mode}`
        + ` · grille ${settings.fillGridSize} x ${settings.fillGridSize}`;

      dom.pipelinePreviewOutput.value =
        JSON.stringify(buildSignatureExport(profile, fingerprint), null, 2);
    } catch (error) {
      if (run !== state.pipelinePreviewRun) return;

      renderPipelinePreview(
        dom.pipelinePreviewCanvas,
        profile,
        profile.fingerprint
      );

      dom.pipelinePreviewStatus.textContent =
        `${profile.reference} - aperçu pipeline indisponible`
        + ` : ${formatError(error)}`;

      dom.pipelinePreviewOutput.value =
        JSON.stringify(buildSignatureExport(profile), null, 2);
    }
  }

  return {
    openScreen,
    applyPipelineSettingsToInputs,
    schedulePipelinePreview,
    selectRandomProfile,
    updatePreview
  };
}
