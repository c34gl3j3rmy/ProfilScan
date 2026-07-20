import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStructuralSignature,
  compareStructuralSignatures
} from '../src/shape-engine/structural-signature.js';
import { analyzeSkeleton } from '../src/shape-engine/structural/skeleton-topology.js';

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

test('construit une signature structurelle v2 stable', () => {
  const signature = buildStructuralSignature(rectangle, {
    gridSize: 48,
    projectionBins: 8,
    orientationBins: 8
  });

  assert.equal(signature.version, 'structural-signature-v2');
  assert.equal(signature.valid, true);
  assert.equal(signature.gridSize, 48);
  assert.equal(signature.projections.horizontal.length, 8);
  assert.equal(signature.projections.vertical.length, 8);
  assert.equal(signature.orientation.length, 8);
  assert.ok(signature.topology.skeletonPixels > 0);
  assert.ok(Array.isArray(signature.topology.endpointPositions));
  assert.ok(Array.isArray(signature.topology.junctionPositions));
  assert.ok(signature.spatial.centroidX >= 0 && signature.spatial.centroidX <= 1);
  assert.ok(signature.spatial.centroidY >= 0 && signature.spatial.centroidY <= 1);
  assert.ok(signature.spatial.aspectRatio > 0);
  assert.ok(signature.fill > 0 && signature.fill <= 1);
});

test('regroupe les pixels voisins appartenant a une meme bifurcation', () => {
  const size = 7;
  const mask = new Uint8Array(size * size);
  const points = [
    [3, 1],
    [3, 2],
    [1, 3],
    [2, 3],
    [3, 3],
    [4, 3],
    [5, 3],
    [3, 4],
    [3, 5]
  ];

  for (const [x, y] of points) mask[y * size + x] = 1;

  const topology = analyzeSkeleton(mask, size);
  assert.equal(topology.components, 1);
  assert.equal(topology.endpoints, 4);
  assert.equal(topology.junctions, 1);
  assert.equal(topology.endpointPositions.length, 4);
  assert.equal(topology.junctionPositions.length, 1);
  assert.equal(topology.endpointDistribution.top, 0.25);
  assert.equal(topology.endpointDistribution.right, 0.25);
  assert.equal(topology.endpointDistribution.bottom, 0.25);
  assert.equal(topology.endpointDistribution.left, 0.25);
});

test('compare une forme identique avec un score maximal', () => {
  const left = buildStructuralSignature(rectangle, { gridSize: 48 });
  const right = buildStructuralSignature(rectangle, { gridSize: 48 });
  assert.equal(compareStructuralSignatures(left, right), 100);
});
