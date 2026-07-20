export function analyzeSkeleton(mask, gridSize) {
  let skeletonPixels = 0;
  let endpoints = 0;
  let junctions = 0;
  const endpointMask = new Uint8Array(mask.length);
  const junctionMask = new Uint8Array(mask.length);
  const endpointHistogram = new Array(9).fill(0);
  const degreeHistogram = new Array(9).fill(0);

  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const index = y * gridSize + x;
      if (!mask