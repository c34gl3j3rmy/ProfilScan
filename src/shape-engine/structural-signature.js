import { registerAlgorithm } from '../observability/algorithm-registry.js';

const DEFAULT_GRID_SIZE = 96;
const DEFAULT_PROJECTION_BINS = 12;

export function buildStructuralSignature(contours, options = {}) {
  const gridSize = positiveInteger(options.gridSize, DEFAULT_GRID_SIZE);
  const projectionBins = positiveInteger(options.projectionBins, DEFAULT_PROJECTION_BINS);
  const normalizedContours = normalizeContours(contours);
  const mask = rasterizeContours(normalizedContours, gridSize);
  const skeleton = thinMask(mask, gridSize);
  const topology = analyzeSkeleton(skeleton, gridSize);
  const projections =