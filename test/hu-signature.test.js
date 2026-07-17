import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHuMoments } from '../src/shape-engine/hu-signature.js';

test('retourne sept zeros sans points valides', () => {
  assert.deepEqual(buildHuMoments([]), Array(7).fill(0));
  assert.deepEqual(buildHuMoments([{ x: 'x', y: 0 }]), Array(7).fill(0));
});

test('retourne sept valeurs finies', () => {
  const points = [
    { x: -1, y: -1 },
    { x: 1, y: -1 },
    { x: 1, y: 1 },
    { x: -1, y: 1 }
  ];
  const signature = buildHuMoments(points);
  assert.equal(signature.length, 7);
  assert.ok(signature.every(Number.isFinite));
});

test('reste invariant par translation', () => {
  const source = [
    { x: 0, y: 0 },
    { x: 3, y: 0 },
    { x: 2, y: 1 },
    { x: 0, y: 2 }
  ];
  const translated = source.map(point => ({ x: point.x + 10, y: point.y - 7 }));
  const left = buildHuMoments(source);
  const right = buildHuMoments(translated);
  left.forEach((value, index) => assert.ok(Math.abs(value - right[index]) < 1e-10));
});
