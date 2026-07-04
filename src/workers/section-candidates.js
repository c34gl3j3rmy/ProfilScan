export function selectSectionCandidates(components, imageWidth, imageHeight, detectionSettings) {
  const imageArea = imageWidth * imageHeight;
  const minArea = Math.max(16, imageArea * detectionSettings.minAreaRatio * 0.35);
  const minSide = Math.max(8, Math.min(imageWidth, imageHeight) * 0.01);
  const maxBoxArea = imageArea * 0.45;

  const scored = components
    .filter(component => component.area >= minArea && component.width >= minSide && component.height >= minSide)
    .filter(component => component.width * component.height <= maxBoxArea)
    .map(component => ({ ...component, sectionScore: scoreSectionCandidate(component, imageWidth, imageHeight) }))
    .filter(component => component.sectionScore >= 0.32)
    .sort((a, b) => b.sectionScore - a.sectionScore);

  const merged = mergeNearbySections(scored, imageWidth, imageHeight, detectionSettings);
  const selected = suppressOverlaps(merged)
    .sort((a, b) => b.sectionScore - a.sectionScore)
    .slice(0, 12)
    .sort((a, b) => a.y - b.y || a.x - b.x);

  if (selected.length) return selected.map(markAsSectionCandidate);

  return legacyFallback(components, imageWidth, imageHeight, detectionSettings).map(markAsSectionCandidate);
}

function scoreSectionCandidate(component, imageWidth, imageHeight) {
  const boxArea = Math.max(1, component.width * component.height);
  const density = clamp(component.area / boxArea, 0, 1);
  const compactness = Math.min(component.width, component.height) / Math.max(component.width, component.height);
  const sizeRatio = boxArea / (imageWidth * imageHeight);
  const closedBonus = component.closed ? 0.22 : 0;
  const holeBonus = Math.min(0.15, (component.holes?.length || 0) * 0.05);
  const sizeScore = scoreRange(sizeRatio, 0.001, 0.018, 0.18);
  const densityScore = scoreRange(density, 0.02, 0.10, 0.55);
  const compactnessScore = scoreRange(compactness, 0.12, 0.28, 0.70);
  const slenderPenalty = compactness < 0.10 ? 0.35 : 0;
  const hugePenalty = sizeRatio > 0.28 ? 0.25 : 0;

  return clamp(sizeScore * 0.28 + densityScore * 0.24 + compactnessScore * 0.31 + closedBonus + holeBonus - slenderPenalty - hugePenalty, 0, 1);
}

function mergeNearbySections(components, imageWidth, imageHeight, detectionSettings) {
  const gap = Math.max(3, Math.min(imageWidth, imageHeight) * Math.min(0.035, detectionSettings.mergeGapRatio * 0.45));
  const groups = [];

  for (const component of components) {
    const group = groups.find(existing => areNear(existing, component, gap) && isSimilarScale(existing, component));
    if (!group) {
      groups.push({ ...component, points: [...component.points], holes: [...(component.holes || [])] });
      continue;
    }

    const maxX = Math.max(group.x + group.width, component.x + component.width);
    const maxY = Math.max(group.y + group.height, component.y + component.height);
    group.x = Math.min(group.x, component.x);
    group.y = Math.min(group.y, component.y);
    group.width = maxX - group.x;
    group.height = maxY - group.y;
    group.area += component.area;
    group.closed = group.closed || component.closed;
    group.points = simplifyPoints([...group.points, ...component.points], 260);
    group.holes = [...(group.holes || []), ...(component.holes || [])].slice(0, 20);
    group.sectionScore = Math.max(group.sectionScore, component.sectionScore) * 0.92;
  }

  return groups.map(group => ({
    ...group,
    points: simplifyPoints(group.closed ? group.points : sortAroundCenter(group.points), 240),
    sectionScore: scoreSectionCandidate(group, imageWidth, imageHeight)
  })).filter(group => group.sectionScore >= 0.28);
}

function legacyFallback(components, imageWidth, imageHeight, detectionSettings) {
  const imageArea = imageWidth * imageHeight;
  const minArea = Math.max(30, imageArea * detectionSettings.minAreaRatio);
  const minSide = Math.max(12, Math.min(imageWidth, imageHeight) * 0.015);
  return components
    .filter(component => component.area >= minArea && component.width >= minSide && component.height >= minSide && component.width * component.height <= imageArea * 0.95)
    .map(component => ({ ...component, points: simplifyPoints(component.closed ? component.points : sortAroundCenter(component.points), 240) }))
    .sort((a, b) => b.width * b.height - a.width * a.height)
    .slice(0, 10)
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

function suppressOverlaps(components) {
  const kept = [];
  for (const component of components) {
    if (kept.some(existing => overlapRatio(existing, component) > 0.42)) continue;
    kept.push(component);
  }
  return kept;
}

function markAsSectionCandidate(component) {
  return {
    ...component,
    closed: component.closed || isAlmostClosed(component.points),
    points: simplifyPoints(component.closed ? component.points : sortAroundCenter(component.points), 240),
    sectionCandidate: true
  };
}

function isAlmostClosed(points) {
  if (points.length < 8) return false;
  const first = points[0];
  const last = points[points.length - 1];
  const box = getBounds(points);
  const closeDistance = Math.hypot(first.x - last.x, first.y - last.y);
  return closeDistance <= Math.max(8, Math.min(box.width, box.height) * 0.28);
}

function isSimilarScale(a, b) {
  const aw = Math.max(1, a.width);
  const ah = Math.max(1, a.height);
  const bw = Math.max(1, b.width);
  const bh = Math.max(1, b.height);
  return Math.max(aw / bw, bw / aw) < 4.5 && Math.max(ah / bh, bh / ah) < 4.5;
}

function areNear(a, b, gap) {
  return !(a.x + a.width + gap < b.x || b.x + b.width + gap < a.x || a.y + a.height + gap < b.y || b.y + b.height + gap < a.y);
}

function overlapRatio(a, b) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const overlap = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return overlap / Math.max(1, Math.min(a.width * a.height, b.width * b.height));
}

function sortAroundCenter(points) {
  if (points.length <= 2) return points;
  const center = points.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
  center.x /= points.length;
  center.y /= points.length;
  return [...points].sort((a, b) => Math.atan2(a.y - center.y, a.x - center.x) - Math.atan2(b.y - center.y, b.x - center.x));
}

function simplifyPoints(points, maxPoints) {
  if (points.length <= maxPoints) return points;
  const step = points.length / maxPoints;
  const output = [];
  for (let index = 0; index < maxPoints; index++) output.push(points[Math.floor(index * step)]);
  return output;
}

function getBounds(points) {
  return points.reduce((bounds, point) => ({
    minX: Math.min(bounds.minX, point.x),
    minY: Math.min(bounds.minY, point.y),
    maxX: Math.max(bounds.maxX, point.x),
    maxY: Math.max(bounds.maxY, point.y),
    width: Math.max(bounds.maxX, point.x) - Math.min(bounds.minX, point.x),
    height: Math.max(bounds.maxY, point.y) - Math.min(bounds.minY, point.y)
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity, width: 0, height: 0 });
}

function scoreRange(value, min, good, max) {
  if (value <= min) return 0;
  if (value <= good) return (value - min) / (good - min);
  if (value <= max) return 1;
  return Math.max(0, 1 - (value - max) / Math.max(max, 1e-6));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
