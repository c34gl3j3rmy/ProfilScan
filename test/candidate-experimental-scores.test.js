import test from 'node:test';
import assert from 'node:assert/strict';
import { compareBaseFingerprintScores } from '../src/shape-engine/candidate-search/base-scores.js';
import { normalizeWeights } from '../src/shape-engine/candidate-search/weights.js';

function fingerprint({
  efdValues = [1, 0.5, 0.25],
  structuralFill = 0.4,
  structuralVariant = false
} = {}) {
  return {
    summary: {
      normalizedRatio: 0.5,
      fillRatio: 0.4
    },
    descriptors: {
      radial: [1, 0.8, 0.6],
      angleHistogram: [0.5, 0.3, 0.2],
      fourier: [1, 0.5, 0.25],
      hu: [0, 0, 0, 0, 0, 0, 0],
      efd: {
        values: efdValues,
        quality: { valid: true }
      },
      structural: {
        valid: true,
        projections: structuralVariant
          ? {
              horizontal: [0.8, 0.2],
              vertical: [0.9, 0.1]
            }
          : {
              horizontal: [0.2, 0.8],
              vertical: [0.4, 0.6]
            },
        orientation: structuralVariant ? [0.2, 0.8] : [0.7, 0.3],
        topology: structuralVariant
          ? {
              skeletonPixels: 42,
              endpoints: 6,
              junctions: 3,
              components: 1,
              endpointPositions: [
                { x: 0.1, y: 0.1 },
                { x: 0.9, y: 0.9 }
              ],
              junctionPositions: [{ x: 0.8, y: 0.2 }],
              endpointDistribution: {
                top: 0.5,
                right: 0,
                bottom: 0.5,
                left: 0,
                center: 0
              },
              junctionDistribution: {
                top: 0,
                right: 1,
                bottom: 0,
                left: 0,
                center: 0
              }
            }
          : {
              skeletonPixels: 20,
              endpoints: 2,
              junctions: 1,
              components: 1,
              endpointPositions: [
                { x: 0.2, y: 0.5 },
                { x: 0.8, y: 0.5 }
              ],
              junctionPositions: [{ x: 0.5, y: 0.5 }],
              endpointDistribution: {
                top: 0,
                right: 0.5,
                bottom: 0,
                left: 0.5,
                center: 0
              },
              junctionDistribution: {
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
                center: 1
              }
            },
        spatial: structuralVariant
          ? {
              centroidX: 0.7,
              centroidY: 0.3,
              width: 0.4,
              height: 0.9,
              aspectRatio: 0.44
            }
          : {
              centroidX: 0.5,
              centroidY: 0.5,
              width: 0.9,
              height: 0.4,
              aspectRatio: 2.25
            },
        fill: structuralFill
      }
    }
  };
}

test('normalise des poids positifs pour EFD et Structural', () => {
  const weights = normalizeWeights();
  assert.ok(weights.efd > 0);
  assert.ok(weights.structural > 0);
});

test('expose les sous-scores EFD et Structural', () => {
  const detected = fingerprint();
  const reference = fingerprint();
  const result = compareBaseFingerprintScores(detected, reference);

  assert.equal(result.subscores.efd, 100);
  assert.equal(result.subscores.structural, 100);
  assert.ok(result.weights.efd > 0);
  assert.ok(result.weights.structural > 0);
});

test('une divergence structurelle réduit le score global', () => {
  const detected = fingerprint();
  const identical = compareBaseFingerprintScores(detected, fingerprint());
  const different = compareBaseFingerprintScores(
    detected,
    fingerprint({ structuralFill: 0.95, structuralVariant: true })
  );

  assert.ok(different.subscores.structural < identical.subscores.structural);
  assert.ok(different.subscores.globalStage < identical.subscores.globalStage);
});

test('une divergence EFD réduit le score global', () => {
  const detected = fingerprint();
  const identical = compareBaseFingerprintScores(detected, fingerprint());
  const different = compareBaseFingerprintScores(detected, fingerprint({ efdValues: [1, 0, 0] }));

  assert.ok(different.subscores.efd < identical.subscores.efd);
  assert.ok(different.subscores.globalStage < identical.subscores.globalStage);
});
