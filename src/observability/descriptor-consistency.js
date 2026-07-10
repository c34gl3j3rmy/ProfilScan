import './core-algorithm-runtime.js';
import { runRegisteredAlgorithms } from './algorithm-orchestrator.js';
import { recordAlgorithmMeasurement } from './algorithm-telemetry.js';

const TARGETS = Object.freeze([
  'ratio',
  'radial-signature',
  'angle-signature',
  'fourier-signature',
  'minutiae-signature',
  'local-feature-signature'
]);

const LEGACY_MAP = Object.freeze({
  ratio: fingerprint => fingerprint.summary?.ratio,
  'radial-signature': fingerprint => fingerprint.descriptors?.radial,
  'angle-signature': fingerprint => fingerprint.descriptors?.angleHistogram,
  'fourier-signature': fingerprint => fingerprint.descriptors?.fourier,
  'minutiae-signature': fingerprint => fingerprint.descriptors?.minutiae,
  'local-feature-signature': fingerprint => fingerprint.descriptors?.localFeature
});

export async function validateFingerprintDescriptors(fingerprint, options = {}) {
  if (!fingerprint) return null;

  const contours = fingerprint.contour?.contours || fingerprint.descriptors?.contours || [];
  const geometry = {
    width: fingerprint.summary?.width,
    height: fingerprint.summary?.height,
    ratio: fingerprint.summary?.ratio
  };

  const { plan, result } = await runRegisteredAlgorithms({
    targets: TARGETS,
    outputs: {
      geometry,
      'normalized-contours': contours
    },
    context: {
      settings: fingerprint.pipelineSettings || {}
    },
    stopOnError: false
  });

  const rows = TARGETS.map(target => {
    const legacy = LEGACY_MAP[target]?.(fingerprint);
    const runtime = result.outputs?.[target];
    const comparison = compareValues(legacy, runtime, options.tolerance ?? 1e-6);

    recordAlgorithmMeasurement(`consistency.${target}`, {
      outputSize: comparison.samples,
      score: comparison.maxAbsoluteError,
      missing: comparison.status === 'missing',
      decision: comparison.status === 'equal' ? 'improved' : comparison.status === 'different' ? 'degraded' : 'neutral'
    });

    return {
      target,
      status: comparison.status,
      samples: comparison.samples,
      maxAbsoluteError: comparison.maxAbsoluteError,
      meanAbsoluteError: comparison.meanAbsoluteError
    };
  });

  return {
    version: 'descriptor-consistency-v1',
    valid: plan.valid && result.success && rows.every(row => ['equal', 'missing'].includes(row.status)),
    planValid: plan.valid,
    executionSuccess: result.success,
    equal: rows.filter(row => row.status === 'equal').length,
    different: rows.filter(row => row.status === 'different').length,
    missing: rows.filter(row => row.status === 'missing').length,
    rows,
    errors: result.errors || []
  };
}

function compareValues(left, right, tolerance) {
  if (left == null || right == null) {
    return {
      status: 'missing',
      samples: 0,
      maxAbsoluteError: null,
      meanAbsoluteError: null
    };
  }

  const leftValues = flattenNumeric(left);
  const rightValues = flattenNumeric(right);
  const count = Math.max(leftValues.length, rightValues.length);
  if (!count || leftValues.length !== rightValues.length) {
    return {
      status: 'different',
      samples: count,
      maxAbsoluteError: null,
      meanAbsoluteError: null
    };
  }

  const errors = leftValues.map((value, index) => Math.abs(value - rightValues[index]));
  const maxAbsoluteError = Math.max(...errors, 0);
  const meanAbsoluteError = errors.reduce((sum, value) => sum + value, 0) / errors.length;

  return {
    status: maxAbsoluteError <= tolerance ? 'equal' : 'different',
    samples: errors.length,
    maxAbsoluteError: round(maxAbsoluteError),
    meanAbsoluteError: round(meanAbsoluteError)
  };
}

function flattenNumeric(value) {
  if (Array.isArray(value)) return value.flatMap(flattenNumeric);
  if (ArrayBuffer.isView(value)) return Array.from(value).flatMap(flattenNumeric);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().flatMap(key => flattenNumeric(value[key]));
  }
  const number = Number(value);
  return Number.isFinite(number) ? [number] : [];
}

function round(value) {
  return Number.isFinite(value) ? Math.round(value * 1e10) / 1e10 : null;
}
