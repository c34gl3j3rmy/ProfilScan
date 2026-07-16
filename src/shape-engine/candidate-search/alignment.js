export function buildAlignmentVariants(points) {
  const variants = [];
  const mirrorModes = [false, true];
  const rotations = [0, 90, 180, 270];

  for (const mirror of mirrorModes) {
    for (const rotation of rotations) {
      variants.push({
        name: `${mirror ? 'miroir-' : ''}rot${rotation}`,
        points: points.map(point => rotatePoint(mirror ? { x: -point.x, y: point.y } : point, rotation))
      });
    }
  }

  return variants;
}

function rotatePoint(point, degrees) {
  if (degrees === 90) return { x: -point.y, y: point.x };
  if (degrees === 180) return { x: -point.x, y: -point.y };
  if (degrees === 270) return { x: point.y, y: -point.x };
  return { x: point.x, y: point.y };
}
