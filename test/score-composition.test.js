import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeHierarchicalBoost,
  computeLocalGate,
  computeRatioGate
} from '../src/shape-engine/candidate-search/advanced-scores.js';
import { composeCandidateScore } from '../src/shape-engine/candidate-search/score-composition.js';

const BASE_WEIGHTS = {
  ratio: 1,
  radial: 1,
  fourier: 1,
  efd: 1,
  angle: 1,
  fill: 1,
  structural: 1,
  minutiae: 1,
  localFeature: 1
};

test('neutralise la porte locale quelle que soit la qualite locale', () => {
  assert.equal(computeLocalGate(Number.NaN), 1);
  assert.equal(computeLocalGate(0), 1);
  assert.equal(computeLocalGate(54.99), 1);
  assert.equal(computeLocalGate(68), 1);
  assert.equal(computeLocalGate(100), 1);
});

test('conserve les seuils de la porte de ratio', () => {
  assert.equal(computeRatioGate(Number.NaN), 1);
  assert.equal(computeRatioGate(85), 1);
  assert.equal(computeRatioGate(70), 0.85);
  assert.equal(computeRatioGate(55), 0.65);
  assert.equal(computeRatioGate(54.99), 0.45);
});

test('le score avance ne depend plus du niveau local', () => {
  const common = {
    ratio: 90,
    radial: 80,
    fourier: 80,
    efd: 80,
    angle: 80,
    fill: 80,
    structural: 80,
    minutiae: 10,
    localFeature: 10
  };

  const lowLocal = composeCandidateScore({
    baseSubscores: common,
    baseWeights: BASE_WEIGHTS,
    advancedSubscores: {},
    advancedRawScore: 80,
    advancedWeight: 0.25
  });

  const highLocal = composeCandidateScore({
    baseSubscores: {
      ...common,
      minutiae: 100,
      localFeature: 100
    },
    baseWeights: BASE_WEIGHTS,
    advancedSubscores: {},
    advancedRawScore: 80,
    advancedWeight: 0.25
  });

  assert.equal(lowLocal.localGate, 1);
  assert.equal(highLocal.localGate, 1);
  assert.equal(lowLocal.advanced, 80);
  assert.equal(highLocal.advanced, 80);
  assert.ok(highLocal.baseStage > lowLocal.baseStage);
});

test('borne le poids avance et le score compose', () => {
  const result = composeCandidateScore({
    baseSubscores: Object.fromEntries(Object.keys(BASE_WEIGHTS).map(key => [key, 100])),
    baseWeights: BASE_WEIGHTS,
    advancedSubscores: {
      localFeature: 100,
      minutiae: 100,
      radial: 100,
      angle: 100,
      hausdorff: 100,
      icp: 100
    },
    advancedRawScore: 100,
    advancedWeight: 2
  });

  assert.equal(result.advancedWeight, 0.75);
  assert.equal(result.hierarchicalBoost, 3);
  assert.equal(result.score, 100);
});

test('le bonus hierarchique conserve ses niveaux actuels', () => {
  assert.equal(computeHierarchicalBoost(
    { localFeature: 88, minutiae: 88, radial: 88, angle: 0 },
    { hausdorff: 0, icp: 0 }
  ), 0.8);

  assert.equal(computeHierarchicalBoost(
    { localFeature: 88, minutiae: 88, radial: 88, angle: 88 },
    { hausdorff: 0, icp: 0 }
  ), 1.8);

  assert.equal(computeHierarchicalBoost(
    { localFeature: 88, minutiae: 88, radial: 88, angle: 88 },
    { hausdorff: 88, icp: 0 }
  ), 3);
});
