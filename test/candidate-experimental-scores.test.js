import test from 'node:test';
import assert from 'node:assert/strict';
import { compareBaseFingerprintScores } from '../src/shape-engine/candidate-search/base-scores.js';
import { normalizeWeights } from '../src/shape-engine/candidate-search/weights.js';

function fingerprint({ efdValues = [1, 0.5, 0.25], structuralFill = 0.4 } = {}) {
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
        projections: {
          horizontal: [0.2, 0.8],
          vertical: [0.4, 0.6]
        },
        orientation: [0.7, 0.3],
        topology: {
          skeletonPixels: 20,
          endpoints: 2,
          junctions: 1,
          components: 1
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
  const different = compareBaseFingerprintScores(detected, fingerprint({ structuralFill: 0.95 }));

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
