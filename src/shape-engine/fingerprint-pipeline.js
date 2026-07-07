import { buildDetectedFingerprintCore, buildProfileDNACore, buildProfileFingerprintCore } from './signature-builder.js';
import { normalizePipelineSettings } from './pipeline-settings.js';
import { buildRasterizedProfileFingerprintCore } from './svg-raster-signature.js';

export async function buildUnifiedFingerprint(source, pipelineSettings = {}) {
  const settings = normalizePipelineSettings(pipelineSettings);
  const kind = source?.kind || inferKind(source);

  if (kind === 'detected') {
    return markUnified(buildDetectedFingerprintCore(source.object || source, settings), 'detected', 'contour');
  }

  if (kind === 'profile') {
    const profile = source.profile || source;
    const raster = source.raster !== false;
    if (raster) {
      try {
        const fingerprint = await buildRasterizedProfileFingerprintCore(profile, settings);
        if (fingerprint) return markUnified(fingerprint, 'profile', 'svg-raster');
      } catch (error) {
        console.warn('Rasterisation SVG ignoree', profile.reference, error);
      }
    }
    return markUnified(buildProfileFingerprintCore(profile, settings), 'profile', 'svg-vector');
  }

  throw new Error('Source de fingerprint non reconnue.');
}

export function buildUnifiedDNA(profile, pipelineSettings = {}) {
  return buildProfileDNACore(profile, normalizePipelineSettings(pipelineSettings));
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
