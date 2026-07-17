import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRadialSignature } from '../src/shape-engine/radial-signature.js';

test('retourne des zéros sans points', () => {
  assert.deepEqual(buildRadialSignature([], 4), [0, 0, 0, 0]);
});

test('normalise la distance maximale à un', () => {
  const signature = buildRadialSignature([
    { x: 1, y: 0 },
    { x: 0, y: 2 },
    { x: -1, y: 0 },
    { x: 0, y: -1 }
  ], 4);

  assert.equal(signature.length, 4);
  assert.equal(Math.max(...signature), 1);
  assert.ok(signature.every(value => value >= 0 && value <= 1));
});

test('ignore les points invalides', () => {
  const signature = buildRadialSignature([
    { x: 1, y: 0 },
    { x: 'invalide', y: 2 },
    null
  ], 8);

  assert.equal(signature.length, 8);
  assert.equal(Math.max(...signature), 1);
});
