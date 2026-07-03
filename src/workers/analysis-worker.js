import { findTopMatches } from '../shape-engine/candidate-search.js';
import { buildDetectedFingerprintFromPoints } from '../shape-engine/signature-builder.js';
import { traceBoundary } from './contour-tracer.js';
import { getScaledImageData, buildGray, blurGray, buildEdgeMask } from './image-preprocessing.js';

const DEFAULT_SETTINGS = {
  image: { brightness: 0, contrast: 100 },
  detection: { edgeQuantile: 0.82, linkRadius: 5, minAreaRatio: 0.0007, mergeGapRatio: 0.045 },
  weights: { ratio: 25, radial: 22, hu: 20, fourier: 18, angle: 10, fill: 5 }
};

self.onmessage = async event => {
  const { type, imageBitmap, collection, settings } = event.data;
  if (type !== 'analyze') return;
  const activeSettings = mergeSettings(settings);

  try {
    postProgress(10, 'Lecture de l image', `${imageBitmap.width} x ${imageBitmap.height} px`);
    const source = getScaledImageData(imageBitmap, 900);
    postProgress(24, 'Pretraitement', `Luminosite ${activeSettings.image.brightness} / contraste ${activeSettings.image.contrast} %`);
    const gray = buildGray(source.imageData, activeSettings.image);
    const blurred = blurGray(gray, source.width, source.height);
    postProgress(40, 'Detection des contours', `Seuil dynamique : ${Math.round(activeSettings.detection.edgeQuantile * 100)} %`);
    const edges = buildEdgeMask(blurred, source.width, source.height, activeSettings.detection.edgeQuantile);
    const edgePoints = sampleMaskPoints(edges, source.width, source.height, source.scale, 4500);
    postProgress(55, 'Connexion des contours', `${edgePoints.length} points contours visibles`);
    const linkedEdges = dilate(edges, source.width, source.height, activeSettings.detection.linkRadius);
    postProgress(68, 'Recherche des objets', 'Composants connexes');
    const components = findComponents(linkedEdges, source.width, source.height);
    postProgress(78, 'Hierarchie des contours', `${components.length} zones trouvees`);
    const objects = filterAndMergeComponents(components, source.width, source.height, activeSettings.detection)
      .map(object => scaleDetectedObject(object, source.scale));
    postProgress(88, 'Comparaison avec la base', `${objects.length} contours candidats`);
    const items = objects.map(object => matchObject(object, collection, activeSettings.weights));
    const debug = {
      edges: edgePoints,
      contours: objects.map(object => ({
        closed: object.closed,
        points: simplifyContourPoints(object.points, 180),
        holes: (object.holes || []).map(hole => ({ closed: hole.closed, points: simplifyContourPoints(hole.points, 120) }))
      }))
    };
    postProgress(96, 'Annotation', `${items.length} profils detectes`);
    self.postMessage({ width: imageBitmap.width, height: imageBitmap.height, preview: imageBitmap, items, settings: activeSettings, debug }, [imageBitmap]);
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};

function mergeSettings(settings = {}) {
  return {
    image: {
      brightness: clampNumber(settings.image?.brightness, DEFAULT_SETTINGS.image.brightness, -80, 80),
      contrast: clampNumber(settings.image?.contrast, DEFAULT_SETTINGS.image.contrast, 50, 180)
    },
    detection: {
      edgeQuantile: clampNumber(settings.detection?.edgeQuantile, DEFAULT_SETTINGS.detection.edgeQuantile, 0.6, 0.95),
      linkRadius: Math.round(clampNumber(settings.detection?.linkRadius, DEFAULT_SETTINGS.detection.linkRadius, 1, 12)),
      minAreaRatio: clampNumber(settings.detection?.minAreaRatio, DEFAULT_SETTINGS.detection.minAreaRatio, 0.0001, 0.004),
      mergeGapRatio: clampNumber(settings.detection?.mergeGapRatio, DEFAULT_SETTINGS.detection.mergeGapRatio, 0.001, 0.15)
    },
    weights: {
      ratio: clampNumber(settings.weights?.ratio, DEFAULT_SETTINGS.weights.ratio, 0, 100),
      radial: clampNumber(settings.weights?.radial, DEFAULT_SETTINGS.weights.radial, 0, 100),
      hu: clampNumber(settings.weights?.hu, DEFAULT_SETTINGS.weights.hu, 0, 100),
      fourier: clampNumber(settings.weights?.fourier, DEFAULT_SETTINGS.weights.fourier, 0, 100),
      angle: clampNumber(settings.weights?.angle, DEFAULT_SETTINGS.weights.angle, 0, 100),
      fill: clampNumber(settings.weights?.fill, DEFAULT_SETTINGS.weights.fill, 0, 100)
    }
  };
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function postProgress(percent, label, detail) {
  self.postMessage({ type: 'progress', percent, label, detail });
}

function dilate(mask, width, height, radius) {
  const output = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let found = 0;
      for (let dy = -radius; dy <= radius && !found; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          if (xx >= 0 && xx < width && mask[yy * width + xx]) { found = 1; break; }
        }
      }
      output[y * width + x] = found;
    }
  }
  return output;
}

function findComponents(mask, width, height) {
  const visited = new Uint8Array(mask.length);
  const components = [];
  const queue = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || visited[start]) continue;
    let count = 0, minX = width, minY = height, maxX = 0, maxY = 0;
    const pixels = [];
    queue.length = 0;
    queue.push(start);
    visited[start] = 1;
    for (let q = 0; q < queue.length; q++) {
      const current = queue[q];
      const x = current % width;
      const y = Math.floor(current / width);
      count++;
      pixels.push({ x, y });
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const xx = x + dx, yy = y + dy, next = yy * width + xx;
        if (xx >= 0 && xx < width && yy >= 0 && yy < height && !visited[next] && mask[next]) {
          visited[next] = 1;
          queue.push(next);
        }
      }
    }
    const contour = traceBoundary(pixels, mask, width, height);
    components.push({
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
      area: count,
      closed: contour.closed,
      points: simplifyContourPoints(contour.points, 240),
      holes: (contour.holes || []).map(hole => ({ closed: hole.closed, points: simplifyContourPoints(hole.points, 160) }))
    });
  }
  return components;
}

function simplifyContourPoints(points, maxPoints) {
  if (points.length <= maxPoints) return points;
  const step = points.length / maxPoints;
  const output = [];
  for (let i = 0; i < maxPoints; i++) output.push(points[Math.floor(i * step)]);
  return output;
}

function sortContourPoints(points) {
  if (points.length <= 2) return points;
  const center = points.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
  center.x /= points.length; center.y /= points.length;
  return [...points].sort((a, b) => Math.atan2(a.y - center.y, a.x - center.x) - Math.atan2(b.y - center.y, b.x - center.x));
}

function filterAndMergeComponents(components, imageWidth, imageHeight, detectionSettings) {
  const imageArea = imageWidth * imageHeight;
  const minArea = Math.max(30, imageArea * detectionSettings.minAreaRatio);
  const minSide = Math.max(12, Math.min(imageWidth, imageHeight) * 0.015);
  const candidates = components.filter(component => component.area >= minArea && component.width >= minSide && component.height >= minSide && component.width * component.height <= imageArea * 0.95);
  const gap = Math.max(4, Math.min(imageWidth, imageHeight) * detectionSettings.mergeGapRatio);
  const groups = [];
  for (const component of candidates) {
    const group = groups.find(existing => areNear(existing, component, gap));
    if (!group) groups.push({ ...component, points: [...component.points], holes: [...(component.holes || [])] });
    else {
      const maxX = Math.max(group.x + group.width, component.x + component.width);
      const maxY = Math.max(group.y + group.height, component.y + component.height);
      group.x = Math.min(group.x, component.x); group.y = Math.min(group.y, component.y);
      group.width = maxX - group.x; group.height = maxY - group.y;
      group.area += component.area;
      group.closed = group.closed || component.closed;
      group.points = simplifyContourPoints([...group.points, ...component.points], 320);
      group.holes = [...(group.holes || []), ...(component.holes || [])];
    }
  }
  return groups
    .filter(group => group.width * group.height > imageArea * 0.002)
    .map(group => ({ ...group, points: simplifyContourPoints(group.closed ? group.points : sortContourPoints(group.points), 240), holes: (group.holes || []).slice(0, 20) }))
    .sort((a, b) => b.width * b.height - a.width * a.height)
    .slice(0, 10)
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

function sampleMaskPoints(mask, width, height, scale, maxPoints) {
  const all = [];
  for (let index = 0; index < mask.length; index++) {
    if (mask[index]) all.push(index);
  }
  const step = Math.max(1, Math.ceil(all.length / maxPoints));
  const points = [];
  for (let i = 0; i < all.length; i += step) {
    const index = all[i];
    points.push({ x: Math.round((index % width) / scale), y: Math.round(Math.floor(index / width) / scale) });
  }
  return points;
}

function areNear(a, b, gap) {
  return !(a.x + a.width + gap < b.x || b.x + b.width + gap < a.x || a.y + a.height + gap < b.y || b.y + b.height + gap < a.y);
}

function scaleDetectedObject(object, scale) {
  return {
    x: Math.round(object.x / scale),
    y: Math.round(object.y / scale),
    width: Math.round(object.width / scale),
    height: Math.round(object.height / scale),
    area: Math.round(object.area / (scale * scale)),
    closed: object.closed,
    points: object.points.map(point => ({ x: Math.round(point.x / scale), y: Math.round(point.y / scale) })),
    holes: (object.holes || []).map(hole => ({ closed: hole.closed, points: hole.points.map(point => ({ x: Math.round(point.x / scale), y: Math.round(point.y / scale) })) }))
  };
}

function matchObject(object, collection, weights) {
  const detectedFingerprint = buildDetectedFingerprintFromPoints(object);
  const topCandidates = findTopMatches(detectedFingerprint, collection, weights, 10);
  const best = topCandidates[0];
  return { reference: best?.reference || 'N/A', designation: best?.designation || 'Profil inconnu', score: best?.score || 0, scoreDetails: best?.scoreDetails || null, topCandidates, boundingBox: { x: object.x, y: object.y, width: object.width, height: object.height } };
}
