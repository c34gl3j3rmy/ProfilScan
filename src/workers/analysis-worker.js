import { findBestMatch } from '../shape-engine/candidate-search.js';
import { buildDetectedFingerprintFromPoints } from '../shape-engine/signature-builder.js';
import { traceBoundary } from './contour-tracer.js';

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
    postProgress(55, 'Renforcement des formes', `Connexion : ${activeSettings.detection.linkRadius} px`);
    const linkedEdges = morphClose(edges, source.width, source.height, activeSettings.detection.linkRadius, Math.max(1, Math.floor(activeSettings.detection.linkRadius / 2)));
    postProgress(68, 'Recherche des objets', 'Composants connexes');
    const components = findComponents(linkedEdges, source.width, source.height);
    postProgress(78, 'Suivi des contours', `${components.length} zones trouvees`);
    const objects = filterAndMergeComponents(components, source.width, source.height, activeSettings.detection).map(object => scaleDetectedObject(object, source.scale));
    postProgress(88, 'Comparaison avec la base', `${objects.length} contours candidats`);
    const items = objects.map(object => matchObject(object, collection, activeSettings.weights));
    const debug = {
      edges: sampleMaskPoints(edges, source.width, source.height, source.scale, 3500),
      contours: objects.map(object => ({ closed: object.closed, points: simplifyContourPoints(object.points, 180) }))
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

function getScaledImageData(imageBitmap, maxSize) {
  const scale = Math.min(1, maxSize / Math.max(imageBitmap.width, imageBitmap.height));
  const width = Math.max(1, Math.round(imageBitmap.width * scale));
  const height = Math.max(1, Math.round(imageBitmap.height * scale));
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(imageBitmap, 0, 0, width, height);
  return { imageData: ctx.getImageData(0, 0, width, height), width, height, scale };
}

function buildGray(imageData, imageSettings) {
  const { data, width, height } = imageData;
  const gray = new Uint8Array(width * height);
  const contrast = imageSettings.contrast / 100;
  const brightness = imageSettings.brightness;
  for (let index = 0; index < gray.length; index++) {
    const offset = index * 4;
    const luminance = 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
    gray[index] = Math.max(0, Math.min(255, Math.round((luminance - 128) * contrast + 128 + brightness)));
  }
  return gray;
}

function blurGray(gray, width, height) {
  const out = new Uint8Array(gray.length);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      out[i] = Math.round((gray[i] * 4 + gray[i - 1] * 2 + gray[i + 1] * 2 + gray[i - width] * 2 + gray[i + width] * 2 + gray[i - width - 1] + gray[i - width + 1] + gray[i + width - 1] + gray[i + width + 1]) / 16);
    }
  }
  return out;
}

function buildEdgeMask(gray, width, height, edgeQuantile) {
  const magnitudes = new Uint16Array(width * height);
  const samples = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const gx = -gray[i - width - 1] - 2 * gray[i - 1] - gray[i + width - 1] + gray[i - width + 1] + 2 * gray[i + 1] + gray[i + width + 1];
      const gy = -gray[i - width - 1] - 2 * gray[i - width] - gray[i - width + 1] + gray[i + width - 1] + 2 * gray[i + width] + gray[i + width + 1];
      const mag = Math.min(1020, Math.abs(gx) + Math.abs(gy));
      magnitudes[i] = mag;
      if (mag > 0 && i % 4 === 0) samples.push(mag);
    }
  }
  samples.sort((a, b) => a - b);
  const threshold = Math.max(35, Math.min(220, samples[Math.floor(samples.length * edgeQuantile)] || 60));
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < magnitudes.length; i++) if (magnitudes[i] >= threshold) mask[i] = 1;
  return mask;
}

function morphClose(mask, width, height, dilateRadius, erodeRadius) {
  return erode(dilate(mask, width, height, dilateRadius), width, height, erodeRadius);
}

function dilate(mask, width, height, radius) {
  const output = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let found = 0;
    for (let dy = -radius; dy <= radius && !found; dy++) for (let dx = -radius; dx <= radius; dx++) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx >= 0 && xx < width && yy >= 0 && yy < height && mask[yy * width + xx]) { found = 1; break; }
    }
    output[y * width + x] = found;
  }
  return output;
}

function erode(mask, width, height, radius) {
  const output = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let full = 1;
    for (let dy = -radius; dy <= radius && full; dy++) for (let dx = -radius; dx <= radius; dx++) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || xx >= width || yy < 0 || yy >= height || !mask[yy * width + xx]) { full = 0; break; }
    }
    output[y * width + x] = full;
  }
  return output;
}

function findComponents(mask, width, height) {
  const visited = new Uint8Array(mask.length);
  const components = [];
  const queue = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || visited[start]) continue;
    let count = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
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
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const xx = x + dx;
        const yy = y + dy;
        const next = yy * width + xx;
        if (xx >= 0 && xx < width && yy >= 0 && yy < height && !visited[next] && mask[next]) {
          visited[next] = 1;
          queue.push(next);
        }
      }
    }
    const contour = traceBoundary(pixels, mask, width, height);
    components.push({ x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, area: count, closed: contour.closed, points: simplifyContourPoints(contour.points, 240) });
  }
  return components;
}

function sortContourPoints(points) {
  if (points.length <= 2) return points;
  const center = points.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
  center.x /= points.length;
  center.y /= points.length;
  return [...points].sort((a, b) => Math.atan2(a.y - center.y, a.x - center.x) - Math.atan2(b.y - center.y, b.x - center.x));
}

function simplifyContourPoints(points, maxPoints) {
  if (points.length <= maxPoints) return points;
  const step = points.length / maxPoints;
  const output = [];
  for (let i = 0; i < maxPoints; i++) output.push(points[Math.floor(i * step)]);
  return output;
}

function filterAndMergeComponents(components, imageWidth, imageHeight, detectionSettings) {
  const imageArea = imageWidth * imageHeight;
  const minArea = Math.max(80, imageArea * detectionSettings.minAreaRatio);
  const minSide = Math.max(18, Math.min(imageWidth, imageHeight) * 0.025);
  const candidates = components.filter(component => component.area >= minArea && component.width >= minSide && component.height >= minSide && component.width * component.height <= imageArea * 0.9);
  const gap = Math.max(4, Math.min(imageWidth, imageHeight) * detectionSettings.mergeGapRatio);
  const groups = [];
  for (const component of candidates) {
    const group = groups.find(existing => areNear(existing, component, gap));
    if (!group) groups.push({ ...component, points: [...component.points] });
    else {
      const maxX = Math.max(group.x + group.width, component.x + component.width);
      const maxY = Math.max(group.y + group.height, component.y + component.height);
      group.x = Math.min(group.x, component.x);
      group.y = Math.min(group.y, component.y);
      group.width = maxX - group.x;
      group.height = maxY - group.y;
      group.area += component.area;
      group.closed = group.closed || component.closed;
      group.points = simplifyContourPoints([...group.points, ...component.points], 320);
    }
  }
  return groups.filter(group => group.width * group.height > imageArea * 0.01).map(group => ({ ...group, points: simplifyContourPoints(group.closed ? group.points : sortContourPoints(group.points), 240) })).sort((a, b) => b.width * b.height - a.width * a.height).slice(0, 10).sort((a, b) => a.y - b.y || a.x - b.x);
}

function sampleMaskPoints(mask, width, height, scale, maxPoints) {
  const points = [];
  const step = Math.max(1, Math.ceil(mask.length / maxPoints));
  for (let index = 0; index < mask.length; index += step) if (mask[index]) points.push({ x: Math.round((index % width) / scale), y: Math.round(Math.floor(index / width) / scale) });
  return points;
}

function areNear(a, b, gap) {
  return !(a.x + a.width + gap < b.x || b.x + b.width + gap < a.x || a.y + a.height + gap < b.y || b.y + b.height + gap < a.y);
}

function scaleDetectedObject(object, scale) {
  return { x: Math.round(object.x / scale), y: Math.round(object.y / scale), width: Math.round(object.width / scale), height: Math.round(object.height / scale), area: Math.round(object.area / (scale * scale)), closed: object.closed, points: object.points.map(point => ({ x: Math.round(point.x / scale), y: Math.round(point.y / scale) })) };
}

function matchObject(object, collection, weights) {
  const detectedFingerprint = buildDetectedFingerprintFromPoints(object);
  const best = findBestMatch(detectedFingerprint, collection, weights);
  return { reference: best?.reference || 'N/A', designation: best?.designation || 'Profil inconnu', score: best?.score || 0, scoreDetails: best?.scoreDetails || null, boundingBox: { x: object.x, y: object.y, width: object.width, height: object.height } };
}
