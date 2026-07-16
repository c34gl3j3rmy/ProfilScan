import { buildAlgorithmAudit } from '../shared/algorithm-registry.js';
import {
  copyText,
  roundArray
} from '../shared/common-utils.js';
import {
  findCandidate,
  findProfile,
  populateProfileReferenceList
} from '../profile-utils.js';

export function createSignatureController({
  state,
  dom,
  navigation,
  getCropBox
}) {
  function refreshProfileList() {
    populateProfileReferenceList(state.collection, dom.profileReferenceList);
  }

  function buildSignatureExport(profile, fingerprint = profile.fingerprint) {
    return {
      reference: profile.reference,
      designation: profile.designation,
      dimensions: {
        width: profile.width,
        height: profile.height,
        ratio: profile.ratio,
        normalizedRatio: fingerprint?.summary?.normalizedRatio
      },
      pipelineSettings:
        fingerprint?.pipelineSettings
        || profile.pipelineSettings
        || state.collection?.pipelineSettings
        || state.currentPipelineSettings,
      summary: fingerprint?.summary,
      subsignatures: {
        radial: roundArray(fingerprint?.descriptors?.radial),
        angleHistogram: roundArray(fingerprint?.descriptors?.angleHistogram),
        hu: roundArray(fingerprint?.descriptors?.hu),
        fourier: roundArray(fingerprint?.descriptors?.fourier),
        efd: roundArray(fingerprint?.descriptors?.efd),
        structural: fingerprint?.descriptors?.structural || null,
        minutiae: fingerprint?.descriptors?.minutiae || null,
        localFeature: fingerprint?.descriptors?.localFeature || null,
        points: (fingerprint?.descriptors?.points || []).slice(0, 80)
      },
      dna: {
        topology: profile.dna?.topology,
        quality: profile.dna?.quality
      }
    };
  }

  function openSignatureScreen() {
    refreshProfileList();
    dom.signatureOutput.value = '';
    navigation.show('signature');
    dom.signatureSearchInput?.focus();
  }

  function showSignature() {
    const reference = dom.signatureSearchInput.value.trim();
    const profile = findProfile(state.collection, reference);

    if (!profile) {
      dom.signatureOutput.value =
        `Reference introuvable : ${dom.signatureSearchInput.value}`;
      return;
    }

    dom.signatureOutput.value =
      JSON.stringify(buildSignatureExport(profile), null, 2);
  }

  async function copySignatureOutput() {
    const text = dom.signatureOutput.value.trim();
    if (!text) return;

    await copyText(text, dom.signatureOutput);
    dom.copySignatureButton.textContent = 'Signature copiee';

    setTimeout(() => {
      dom.copySignatureButton.textContent = 'Copier la signature';
    }, 1200);
  }

  function buildAnalysisReport() {
    const expected = findProfile(
      state.collection,
      dom.expectedProfileInput?.value.trim()
    );
    const best = state.lastResult?.items?.[0] || null;
    const expectedCandidate = expected
      ? findCandidate(state.lastResult, expected.reference)
      : null;

    return {
      type: 'ProfilScan analysis report',
      generatedAt: new Date().toISOString(),
      pipelineSettings: state.currentPipelineSettings,
      base: {
        name: state.collection?.name,
        profiles: state.collection?.profiles?.length,
        importedAt: state.collection?.importedAt,
        pipelineSettings: state.collection?.pipelineSettings
      },
      image: {
        width: state.lastResult?.width,
        height: state.lastResult?.height,
        detectedItems: state.lastResult?.items?.length || 0,
        contours: state.lastResult?.debug?.contours?.length || 0,
        holes: (state.lastResult?.debug?.contours || [])
          .reduce((sum, contour) => sum + (contour.holes?.length || 0), 0),
        crop: getCropBox()
      },
      autoSettings: state.lastAutoSettings,
      settings: state.lastResult?.settings,
      expectedProfile: expected ? buildSignatureExport(expected) : null,
      bestMatch: best,
      expectedCandidate,
      algorithmAudit: buildAlgorithmAudit(best, expectedCandidate, expected),
      topCandidates: (best?.topCandidates || []).slice(0, 10),
      detectedSignature: {
        scoreDetails: best?.scoreDetails || null,
        boundingBox: best?.boundingBox || null,
        debugContours: (state.lastResult?.debug?.contours || []).slice(0, 3)
      }
    };
  }

  async function copyAnalysisReport() {
    if (!state.lastResult) return;

    await copyText(
      JSON.stringify(buildAnalysisReport(), null, 2),
      dom.signatureOutput
    );

    dom.copyAnalysisReportButton.textContent = 'Rapport copie';
    setTimeout(() => {
      dom.copyAnalysisReportButton.textContent = "Copier le rapport d'analyse";
    }, 1200);
  }

  return {
    refreshProfileList,
    buildSignatureExport,
    openSignatureScreen,
    showSignature,
    copySignatureOutput,
    copyAnalysisReport
  };
}
