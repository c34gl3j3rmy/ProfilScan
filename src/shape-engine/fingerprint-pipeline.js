import '../observability/core-algorithm-runtime.js';
import { buildDetectedFingerprintCore, buildProfileDNACore, buildProfileFingerprintCore } from './signature-builder.js';
import { normalizePipelineSettings } from './pipeline-settings.js';
import { buildRasterizedProfileFingerprintCore } from './svg-raster-signature.js';
import { buildEllipticFourierDescriptor } from './elliptic-fourier.js';
import { buildStructuralSignature } from './structural-signature.js';
import { measureFingerprintBuild, observeFingerprintBuild } from '../observability/fingerprint-observer.js';
import { validateFingerprintDescriptors } from '../observability/descriptor-consistency.js';
import { buildAlgorithmTelemetryReport } from '../observability/algorithm-telemetry.js';

export async function buildUnifiedFingerprint(source, pipelineSettings = {}) {
  const settings = normalizePipelineSettings(pipelineSettings);
  const kind = source?.kind || inferKind(source);

  if (kind === 'detected') {
    const fingerprint = await measureFingerprintBuild(
      () => markUnified(enrichExperimentalDescriptors(buildDetectedFingerprintCore(source.object || source, settings), settings), 'detected', 'contour'),
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
            return built ? markUnified(enrichExperimentalDescriptors(built, settings), 'profile', 'svg-raster') : null;
          },
          { sourceKind: 'profile', pipelineMode: 'svg-raster' }
        );
        if (fingerprint) return attachConsistencyReport(fingerprint);
      } catch (error) {
        console.warn('Rasterisation SVG ignoree', profile.reference, error);
      }
    }

    const fingerprint = await measureFingerprintBuild(
      () => markUnified(enrichExperimentalDescriptors(buildProfileFingerprintCore(profile, settings), settings), 'profile', 'svg-vector'),
      { sourceKind: 'profile', pipelineMode: 'svg-vector' }
    );
    return attachConsistencyReport(fingerprint);
  }

  throw new Error('Source de fingerprint non reconnue.');
}

export function buildUnifiedDNA(profile, pipelineSettings = {}) {
  const settings = normalizePipelineSettings(pipelineSettings);
  const dna = buildProfileDNACore(profile, settings);
  if (dna?.descriptors) {
    const enriched = enrichExperimentalDescriptors({
      descriptors: dna.descriptors,
      contour: dna.contour,
      summary: dna.globalShape || {}
    }, settings);
    dna.descriptors = enriched.descriptors;

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
    dna.observabilityTelemetry = buildAlgorithmTelemetryReport({
      source: 'fingerprint-pipeline',
      sourceKind: 'profile',
      pipelineMode: 'svg-dna'
    });
  }
  return dna;
}

function enrichExperimentalDescriptors(fingerprint, settings = {}) {
  if (!fingerprint) return fingerprint;
  const contours = fingerprint.descriptors?.contours || fingerprint.contour?.contours || [];
  if (!Array.isArray(contours) || !contours.length) return fingerprint;

  const descriptors = { ...(fingerprint.descriptors || {}) };
  if (!descriptors.efd) {
    descriptors.efd = buildEllipticFourierDescriptor(contours, {
      harmonics: Number(settings.efdHarmonics) || 12
    });
  }
  if (!descriptors.structural) {
    descriptors.structural = buildStructuralSignature(contours, {
      gridSize: Number(settings.structuralGridSize) || 96,
      projectionBins: Number(settings.structuralProjectionBins) || 12
    });
  }

  return {
    ...fingerprint,
    descriptors,
    summary: {
      ...(fingerprint.summary || {}),
      experimentalDescriptors: {
        efd: Boolean(descriptors.efd?.quality?.valid),
        structural: Boolean(descriptors.structural?.quality?.valid)
      }
    }
  };
}

async function attachConsistencyReport(fingerprint) {
  if (!fingerprint) return fingerprint;

  try {
    const descriptorConsistency = await validateFingerprintDescriptors(fingerprint);
    return attachTelemetry(fingerprint, descriptorConsistency);
  } catch (error) {
    return attachTelemetry(fingerprint, {
      version: 'descriptor-consistency-v1',
      valid: false,
      error: String(error?.message || error)
    });
  }
}

function attachTelemetry(fingerprint, descriptorConsistency) {
  const sourceKind = fingerprint.summary?.sourceKind || 'unknown';
  const pipelineMode = fingerprint.summary?.pipelineMode || 'unknown';

  return {
    ...fingerprint,
    summary: {
      ...fingerprint.summary,
      descriptorConsistency,
      observabilityTelemetry: buildAlgorithmTelemetryReport({
        source: 'fingerprint-pipeline',
        sourceKind,
        pipelineMode,
        reference: fingerprint.reference || null
      })
    }
  };
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
