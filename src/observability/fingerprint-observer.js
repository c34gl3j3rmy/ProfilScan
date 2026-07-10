import { recordAlgorithmMeasurement } from './algorithm-telemetry.js';

const DESCRIPTOR_MAP = Object.freeze({
  radial: 'radial',
  fourier: 'fourier',
  angleHistogram: 'angle',
  hu: 'hu',
  minutiae: 'minutiae',
  localFeature: 'localFeature'
});

export function observeFingerprintBuild(fingerprint, metadata = {}) {
  if (!fingerprint) return fingerprint;

  const durationMs = finiteOrNull(metadata.durationMs);
  const sourceKind = metadata.sourceKind || fingerprint.summary?.sourceKind || fingerprint.summary?.source || 'unknown';
  const pipelineMode = metadata.pipelineMode || fingerprint.summary?.pipelineMode || 'unknown';
  const pipelineId = `fingerprint.${sourceKind}.${pipelineMode}`;

  recordAlgorithmMeasurement(pipelineId, {
    durationMs,
    output: fingerprint,
    missing: false
  });

  const descriptors = fingerprint.descriptors || {};
  for (const [key, algorithmId] of Object.entries(DESCRIPTOR_MAP)) {
    const value = descriptors[key];
    recordAlgorithmMeasurement(algorithmId, {
      output: value,
      missing: value == null || (Array.isArray(value) && value.length === 0)
    });
  }

  recordAlgorithmMeasurement('fill', {
    outputSize: 1,
    score: finiteOrNull(fingerprint.summary?.fillRatio),
    missing: !Number.isFinite(Number(fingerprint.summary?.fillRatio))
  });

  recordAlgorithmMeasurement('ratio', {
    outputSize: 1,
    score: finiteOrNull(fingerprint.summary?.normalizedRatio ?? fingerprint.summary?.ratio),
    missing: !Number.isFinite(Number(fingerprint.summary?.normalizedRatio ?? fingerprint.summary?.ratio))
  });

  return {
    ...fingerprint,
    summary: {
      ...fingerprint.summary,
      observability: {
        version: 'fingerprint-observer-v1',
        pipelineId,
        durationMs
      }
    }
  };
}

export async function measureFingerprintBuild(operation, metadata = {}) {
  const startedAt = now();
  const fingerprint = await operation();
  return observeFingerprintBuild(fingerprint, {
    ...metadata,
    durationMs: now() - startedAt
  });
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function now() {
  return globalThis.performance?.now ? performance.now() : Date.now();
}
