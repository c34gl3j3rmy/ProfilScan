import '../observability/core-algorithm-runtime.js';
import { buildDetectedFingerprintCore, buildProfileDNACore, buildProfileFingerprintCore } from './signature-builder.js';
import { normalizePipelineSettings } from './pipeline-settings.js';
import { buildRasterizedProfileFingerprintCore } from './svg-raster-signature.js';
import { measureFingerprintBuild, observeFingerprintBuild } from '../observability/fingerprint-observer.js';
import { validateFingerprintDescriptors } from '../observability/descriptor-consistency.js';

export async function buildUnifiedFingerprint(source, pipelineSettings = {}) {
  const settings = normalizePipelineSettings(pipelineSettings);
  const kind = source?.kind || inferKind(source);

  if (kind === 'detected') {
    const fingerprint = await measureFingerprintBuild(
      () => markUnified(buildDetectedFingerprintCore(source.object || source, settings), 'detected', 'contour'),
      { sourceKind: 'detected', pipelineMode: 'contour' }
    );
    return attachConsistencyReport(fingerprint);
  }

  if (kind === 'profile') {
    const profile = source.profile || source;
    const raster = source.raster !== false;

    if (raster) {
      try {
        const fingerprint = await measureFingerprintBuild(
          async () => {
            const built = await buildRasterizedProfileFingerprintCore(profile, settings);
            return built ? markUnified(built, 'profile', 'svg-raster') : null;
          },
          { sourceKind: 'profile', pipelineMode: 'svg-raster' }
        );
        if (fingerprint) return attachConsistencyReport(fingerprint);
      } catch (error) {
        console.warn('Rasterisation SVG ignoree', profile.reference, error);
      }
    }

    const fingerprint = await measureFingerprintBuild(
      () => markUnified(buildProfileFingerprintCore(profile, settings), 'profile', 'svg-vector'),
      { sourceKind: 'profile', pipelineMode: 'svg-vector' }
    );
    return attachConsistencyReport(fingerprint);
  }

  throw new Error('Source de fingerprint non reconnue.');
}

export function buildUnifiedDNA(profile, pipelineSettings = {}) {
  const dna = buildProfileDNACore(profile, normalizePipelineSettings(pipelineSettings));
  if (dna?.descriptors) {
    const observedFingerprint = observeFingerprintBuild({
      descriptors: dna.descriptors,
      summary: {
        ...(dna.globalShape || {}),
        contourCount: dna.topology?.contourCount,
        source: 'svg-dna',
        sourceKind: 'profile',
        pipelineMode: 'svg-dna'
      }
    }, {
      sourceKind: 'profile',
      pipelineMode: 'svg-dna'
    });
    dna.observability = observedFingerprint.summary?.observability || null;
  }
  return dna;
}

async function attachConsistencyReport(fingerprint) {
  if (!fingerprint) return fingerprint;

  try {
    const descriptorConsistency = await validateFingerprintDescriptors(fingerprint);
    return {
      ...fingerprint,
      summary: {
        ...fingerprint.summary,
        descriptorConsistency
      }
    };
  } catch (error) {
    return {
      ...fingerprint,
      summary: {
        ...fingerprint.summary,
        descriptorConsistency: {
          version: 'descriptor-consistency-v1',
          valid: false,
          error: String(error?.message || error)
        }
      }
    };
  }
}

function inferKind(source) {
  if (source?.object || source?.points || source?.area) return 'detected';
  if (source?.profile || source?.svgPath || source?.paths) return 'profile';
  return '';
}

function markUnified(fingerprint, sourceKind, pipelineMode) {
  if (!fingerprint) return fingerprint;
  return {
    ...fingerprint,
    summary: {
      ...fingerprint.summary,
      unifiedPipeline: true,
      sourceKind,
      pipelineMode
    }
  };
}
