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
    version: 'structural-signature-v2',
    valid: occupied > 0 && topology.skeletonPixels > 0,
    gridSize,
    projectionBins,
    orientationBins,
    topology,
    projections,
    orientation,
    spatial: buildSpatialFeatures(mask, gridSize, occupied),
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
  const topologySpatialScore = average([
    distributionSimilarity(
      left.topology?.endpointDistribution,
      right.topology?.endpointDistribution
    ),
    distributionSimilarity(
      left.topology?.junctionDistribution,
      right.topology?.junctionDistribution
    ),
    pointSetSimilarity(
      left.topology?.endpointPositions,
      right.topology?.endpointPositions
    ),
    pointSetSimilarity(
      left.topology?.junctionPositions,
      right.topology?.junctionPositions
    )
  ]);
  const spatialScore = vectorSimilarity(
    spatialVector(left.spatial),
    spatialVector(right.spatial)
  );
  const fillScore = scalarSimilarity(left.fill, right.fill);

  return clamp(
    (projectionScore * 0.25 +
      orientationScore * 0.15 +
      topologyScore * 0.25 +
      topologySpatialScore * 0.2 +
      spatialScore * 0.1 +
      fillScore * 0.05) * 100,
    0,
    100
  );
}

registerAlgorithm({
  id: 'structural',
  label: 'Signature structurelle',
  version: '2.0.0',
  stage: 'descriptor',
  status: 'experimental',
  requires: ['normalized-contours'],
  produces: ['structural-signature'],
  tags: ['raster', 'skeleton', 'topology', 'spatial', 'experimental'],
  description: 'Decrit la topologie, la position des branches, les projections et les orientations du profil.',
  compute: ({ input, context }) => buildStructuralSignature(
    input['normalized-contours'],
    context?.settings?.structural || {}
  ),
  compare: compareStructuralSignatures
});

function buildSpatialFeatures(mask, size, occupied) {
  if (!occupied) {
    return {
      centroidX: 0,
      centroidY: 0,
      width: 0,
      height: 0,
      aspectRatio: 0
    };
  }

  let sumX = 0;
  let sumY = 0;
  let minX = size;
  let minY = size;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!mask[y * size + x]) continue;
      sumX += x;
      sumY += y;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  const scale = Math.max(1, size - 1);
  const width = (maxX - minX + 1) / size;
  const height = (maxY - minY + 1) / size;

  return {
    centroidX: sumX / occupied / scale,
    centroidY: sumY / occupied / scale,
    width,
    height,
    aspectRatio: width / Math.max(height, 1 / size)
  };
}

function topologyVector(topology = {}) {
  return [
    Math.min(1, (Number(topology.endpoints) || 0) / 24),
    Math.min(1, (Number(topology.junctions) || 0) / 16),
    Math.min(1, (Number(topology.components) || 0) / 8),
    Math.min(1, (Number(topology.skeletonPixels) || 0) / 512)
  ];
}

function spatialVector(spatial = {}) {
  return [
    Number(spatial.centroidX) || 0,
    Number(spatial.centroidY) || 0,
    Number(spatial.width) || 0,
    Number(spatial.height) || 0,
    Math.min(1, (Number(spatial.aspectRatio) || 0) / 8)
  ];
}

function distributionSimilarity(left = {}, right = {}) {
  const keys = ['top', 'right', 'bottom', 'left', 'center'];
  return vectorSimilarity(
    keys.map(key => Number(left?.[key]) || 0),
    keys.map(key => Number(right?.[key]) || 0)
  );
}

function pointSetSimilarity(left = [], right = []) {
  if (!left.length && !right.length) return 1;
  if (!left.length || !right.length) return 0;

  const countScore = scalarSimilarity(left.length, right.length);
  const forward = averageNearestDistance(left, right);
  const backward = averageNearestDistance(right, left);
  const positionScore = 1 - clamp((forward + backward) / 2 / Math.SQRT2, 0, 1);

  return countScore * 0.4 + positionScore * 0.6;
}

function averageNearestDistance(source, target) {
  return average(source.map(point => Math.min(...target.map(candidate => {
    const dx = (Number(point.x) || 0) - (Number(candidate.x) || 0);
    const dy = (Number(point.y) || 0) - (Number(candidate.y) || 0);
    return Math.hypot(dx, dy);
  }))));
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
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

function positiveInteger(value, fallback) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
