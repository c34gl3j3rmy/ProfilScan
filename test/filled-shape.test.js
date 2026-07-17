import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFilledShape,
  isPointInsideContours,
  isPointInsidePolygon
} from '../src/shape-engine/filled-shape.js';

const square = [
  { x: -0.5, y: -0.5 },
  { x: 0.5, y: -0.5 },
  { x: 0.5, y: 0.5 },
  { x: -0.5, y: 0.5 },
  { x: -0.5, y: -0.5 }
];

test('une forme vide produit un remplissage nul', () => {
  assert.deepEqual(buildFilledShape([], 16), {
    points: [],
    fillRatio: 0,
    gridSize: 16
  });
});

test('un carre couvrant la grille produit un remplissage complet', () => {
  const result = buildFilledShape([{ points: square, closed: true }], 16);

  assert.equal(result.gridSize, 16);
  assert.equal(result.points.length, 256);
  assert.equal(result.fillRatio, 1);
});

test('la regle evenodd conserve les trous', () => {
  const hole = [
    { x: -0.25, y: -0.25 },
    { x: 0.25, y: -0.25 },
    { x: 0.25, y: 0.25 },
    { x: -0.25, y: 0.25 },
    { x: -0.25, y: -0.25 }
  ];

  assert.equal(isPointInsideContours(0.4, 0, [{ points: square }, { points: hole }]), true);
  assert.equal(isPointInsideContours(0, 0, [{ points: square }, { points: hole }]), false);
});

test('le test point-polygone distingue interieur et exterieur', () => {
  assert.equal(isPointInsidePolygon(0, 0, square), true);
  assert.equal(isPointInsidePolygon(0.75, 0, square), false);
});
