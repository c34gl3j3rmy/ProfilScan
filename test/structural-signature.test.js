import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStructuralSignature,
  compareStructuralSignatures
} from '../src/shape-engine/structural-signature.js';

const rectangle = [{
  closed: true,
  points: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 40 },
    { x: 0, y: 40 },
    { x: 0, y: 0 }
  ]
}];

test('retourne une signature invalide pour une forme vide', () => {
  const signature = buildStructuralSignature([]);
  assert.equal(signature.valid, false);
  assert.equal(signature.topology.skeletonPixels, 0);
  assert.equal(signature.fill, 0);
});

test('construit une signature stable pour un rectangle', () => {
  const signature = buildStructuralSignature(rectangle, {
    gridSize: 48,
    projectionBins: 8,
    orientationBins: 8
  });

  assert.equal(signature.valid, true);
  assert.equal(signature.gridSize, 48);
  assert.equal(signature.projections.horizontal.length, 8);
  assert.equal(signature.projections.vertical.length, 8);
  assert.equal(signature.orientation.length, 8);
  assert.ok(signature.topology.skeletonPixels > 0);
  assert.ok(signature.fill > 0 && signature.fill <= 1);
});

test('compare une forme identique avec un score maximal', () => {
  const left = buildStructuralSignature(rectangle, { gridSize: 48 });
  const right = buildStructuralSignature(rectangle, { gridSize: 48 });
  assert.equal(compareStructuralSignatures(left, right), 100);
});
