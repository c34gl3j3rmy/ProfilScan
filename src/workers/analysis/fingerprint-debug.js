import {
  sampleContours,
  samplePoints
} from './contour-utils.js';

function copyNumericArray(value, maxLength) {
  if (!Array.isArray(value)) return [];

  return value.slice(0, maxLength).map(entry => {
    const number = Number(entry);
    return Number.isFinite(number)
      ? Math.round(number * 1000000) / 1000000
      : null;
  });
}

function summarizeDescriptorObject(value) {
  if (!value || typeof value !== 'object') return null;

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      Array.isArray(entry) ? entry.length : entry
    ])
  );
}

export function summarizeFingerprint(fingerprint) {
  if (!fingerprint) return null;

  const descriptors = fingerprint.descriptors || {};

  return {
    version: fingerprint.version || null,
    reference: fingerprint.reference || null,
    summary: fingerprint.summary || null,
    valuesLength: Array.isArray(fingerprint.values)
      ? fingerprint.values.length
      : 0,
    normalizedPointCount:
      fingerprint.contour?.normalizedPoints?.length || 0,

    descriptorSizes: {
      radial: descriptors.radial?.length || 0,
      angleHistogram: descriptors.angleHistogram?.length || 0,
      hu: descriptors.hu?.length || 0,
      fourier: descriptors.fourier?.length || 0,
      efd: descriptors.efd?.length || 0,
      points: descriptors.points?.length || 0,
      contours: descriptors.contours?.length || 0,
      minutiae: summarizeDescriptorObject(descriptors.minutiae),
      localFeature: summarizeDescriptorObject(descriptors.localFeature),
      structural: summarizeDescriptorObject(descriptors.structural)
    },

    descriptorSamples: {
      minutiae: descriptors.minutiae || null,
      localFeature: descriptors.localFeature || null,
      structural: descriptors.structural || null
    },

    visualDescriptors: {
      radial: copyNumericArray(descriptors.radial, 128),
      angleHistogram: copyNumericArray(
        descriptors.angleHistogram,
        128
      ),
      hu: copyNumericArray(descriptors.hu, 16),
      fourier: copyNumericArray(descriptors.fourier, 128),
      efd: copyNumericArray(descriptors.efd, 128),
      values: copyNumericArray(fingerprint.values, 256),
      normalizedPoints: samplePoints(
        fingerprint.contour?.normalizedPoints
        || descriptors.points
        || [],
        256
      ),
      normalizedContours: sampleContours(
        fingerprint.contour?.contours
        || descriptors.contours
        || [],
        256
      )
    }
  };
}
