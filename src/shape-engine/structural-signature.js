import { registerAlgorithm } from '../observability/algorithm-registry.js';
import { normalizeContours } from './contour-utils.js';
import { rasterizeContours } from './structural/rasterize-contours.js';
import { thinMask } from './structural/skeletonize-mask.js';
import { analyzeSkeleton } from './structural/skeleton-topology.js';
import {
  buildOrientationHistogram,
  buildProjections
} from './structural/structural-features.js';

const DEFAULT_GRID_SIZE = 96;
const DEFAULT_PROJECTION_BINS = 12;
const DEFAULT_ORIENTATION_BINS = 8;

export function buildStructuralSignature(contours, options = {}) {
  const gridSize = positiveInteger(options.gridSize, DEFAULT_GRID_SIZE);
  const projectionBins = positiveInteger(
    options.projectionBins,
    DEFAULT_PROJECTION_BINS
  );
  const orientationBins = positiveInteger(
    options.orientationBins,
    DEFAULT_ORIENTATION_BINS
  );
  const normalizedContours = normalizeContours(contours);
  const mask = rasterizeContours(normalizedContours, gridSize);
  const skeleton = thinMask(mask, gridSize);
  const topology = analyzeSkeleton(skeleton, gridSize);
  const projections = buildProjections(mask, gridSize, projectionBins);
  const orientation = buildOrientationHistogram(
    skeleton,
    gridSize,
    orientationBins
  );
  const occupied = mask.reduce((sum, value) => sum + value, 0);

  return {
    version: 'structural-signature-v1',
    valid: occupied > 0 && topology.skeletonPixels > 0,
    gridSize,
    projectionBins,
    orientationBins,
    topology,
    projections,
    orientation,
    fill: occupied / (gridSize * gridSize)
  };
}

export function compareStructuralSignatures(left, right) {
  if (!left?.valid || !right?.valid) return 0;

  const projectionScore = average([
    vectorSimilarity(left.projections?.horizontal, right.projections?.horizontal),
    vectorSimilarity(left.projections?.vertical, right.projections?.vertical)
  ]);
  const orientationScore = vectorSimilarity(left.orientation, right.orientation);
  const topologyScore = vectorSimilarity(
    topologyVector(left.topology),
    topologyVector(right.topology)
  );
  const fillScore = scalarSimilarity(left.fill, right.fill);

  return clamp(
    (projectionScore * 0.35 +
      orientationScore * 0.25 +
      topologyScore * 0.25 +
      fillScore * 0.15) * 100,
    0,
    100
  );
}

registerAlgorithm({
  id: 'structural',
  label: 'Signature structurelle',
  version: '1.0.0',
  stage: 'descriptor',
  status: 'experimental',
  requires: ['normalized-contours'],
  produces: ['structural-signature'],
  tags: ['raster', 'skeleton', 'topology', 'experimental'],
  description: 'Decrit la topologie, les projections et les orientations du profil.',
  compute: ({ input, context }) => buildStructuralSignature(
    input['normalized-contours'],
    context?.settings?.structural || {}
  ),
  compare: compareStructuralSignatures
});

function topologyVector(topology = {}) {
  const pixels = Math.max(1, Number(topology.skeletonPixels) || 0);
  return [
    (Number(topology.endpoints) || 0) / pixels,
    (Number(topology.junctions) || 0) / pixels,
    Math.min(1, (Number(topology.components) || 0) / 8)
  ];
}

function vectorSimilarity(left = [], right = []) {
  const count = Math.min(left?.length || 0, right?.length || 0);
  if (!count) return 0;

  let distance = 0;
  for (let index = 0; index < count; index++) {
    const delta = Number(left[index] || 0) - Number(right[index] || 0);
    distance += delta * delta;
  }

  return 1 - clamp(Math.sqrt(distance / count), 0, 1);
}

function scalarSimilarity(left, right) {
  const a = Number(left) || 0;
  const b = Number(right) || 0;
  return 1 - Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-12);
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function positiveInteger(value, fallback) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
