import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAngleHistogram } from '../src/shape-engine/angle-signature.js';

test('retourne un histogramme nul sans contour', () => {
  assert.deepEqual(buildAngleHistogram([], 8), Array(8).fill(0));
});

test('normalise la somme des orientations a un', () => {
  const contours = [{
    points: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
      { x: 0, y: 0 }
    ],
    closed: true
  }];

  const histogram = buildAngleHistogram(contours, 8);
  const total = histogram.reduce((sum, value) => sum + value, 0);

  assert.equal(histogram.length, 8);
  assert.ok(Math.abs(total - 1) < 1e-12);
  assert.equal(histogram.filter(value => value > 0).length, 4);
});

test('ignore les segments nuls et les points invalides', () => {
  const contours = [{
    points: [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: Number.NaN, y: 1 },
      { x: 1, y: 0 }
    ]
  }];

  assert.deepEqual(buildAngleHistogram(contours, 4), Array(4).fill(0));
});
