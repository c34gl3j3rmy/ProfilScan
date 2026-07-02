import { findBestMatch } from '../shape-engine/candidate-search.js';

self.onmessage = async event => {
  const { type, imageBitmap, collection } = event.data;
  if (type !== 'analyze') return;

  try {
    postProgress(12, 'Lecture de l image', `${imageBitmap.width} x ${imageBitmap.height} px`);
    const imageData = getImageData(imageBitmap);

    postProgress(28, 'Estimation du fond', 'Analyse des bords de l image');
    const background = estimateBackgroundLuminance(imageData);

    postProgress(42, 'Segmentation', `Fond estime : ${Math.round(background)}`);
    const rawMask = buildForegroundMask(imageData, background);

    postProgress(56, 'Nettoyage', 'Regroupement des zones proches');
    const cleanMask = morphClose(rawMask, imageData.width, imageData.height, 4);

    postProgress(68, 'Detection des composants', 'Recherche des objets principaux');
    const components = findComponents(cleanMask, imageData.width, imageData.height);

    postProgress(78, 'Filtrage des profils', `${components.length} zones trouvees`);
    const objects = filterComponents(components, imageData.width, imageData.height);

    postProgress(88, 'Comparaison avec la base', `${objects.length} profils candidats`);
    const items = objects.map(object => matchObject(object, collection));

    postProgress(96, 'Annotation', `${items.length} profils detectes`);
    self.postMessage({ width: imageBitmap.width, height: imageBitmap.height, preview: imageBitmap, items }, [imageBitmap]);
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};

function postProgress(percent, label, detail) {
  self.postMessage({ type: 'progress', percent, label, detail });
}

function getImageData(imageBitmap) {
  const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imageBitmap, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function luminanceAt(data, index) {
  const offset = index * 4;
  return 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
}

function estimateBackgroundLuminance(imageData) {
  const { data, width, height } = imageData;
  const values = [];
  const step = Math.max(1, Math.floor(Math.min(width, height) / 80));

  for (let x = 0; x < width; x += step) {
    values.push(luminanceAt(data, x));
    values.push(luminanceAt(data, (height - 1) * width + x));
  }
  for (let y = 0; y < height; y += step) {
    values.push(luminanceAt(data, y * width));
    values.push(luminanceAt(data, y * width + width - 1));
  }

  values.sort((a, b) => a - b);
  return values[Math.floor(values.length * 0.75)] || 220;
}

function buildForegroundMask(imageData, background) {
  const { data, width, height } = imageData;
  const mask = new Uint8Array(width * height);
  const threshold = Math.max(18, Math.min(55, background * 0.14));

  for (let index = 0; index < width * height; index++) {
    const offset = index * 4;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const spread = Math.max(r, g, b) - Math.min(r, g, b);

    const darkerThanBackground = lum < background - threshold;
    const darkDetail = lum < 115 && spread < 95;
    const metalEdge = lum < background - 12 && spread < 55;

    if (darkerThanBackground || darkDetail || metalEdge) mask[index] = 1;
  }

  return mask;
}

function morphClose(mask, width, height, radius) {
  return erode(dilate(mask, width, height, radius), width, height, Math.max(1, Math.floor(radius / 2)));
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
          if (xx < 0 || xx >= width) continue;
          if (mask[yy * width + xx]) { found = 1; break; }
        }
      }
      output[y * width + x] = found;
    }
  }
  return output;
}

function erode(mask, width, height, radius) {
  const output = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let full = 1;
      for (let dy = -radius; dy <= radius && full; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) { full = 0; break; }
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width || !mask[yy * width + xx]) { full = 0; break; }
        }
      }
      output[y * width + x] = full;
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
    let count = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    queue.length = 0;
    queue.push(start);
    visited[start] = 1;

    for (let q = 0; q < queue.length; q++) {
      const current = queue[q];
      const x = current % width;
      const y = Math.floor(current / width);
      count++;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      add(current - 1, x > 0);
      add(current + 1, x < width - 1);
      add(current - width, y > 0);
      add(current + width, y < height - 1);
    }
    components.push({ x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, area: count });
  }

  return components;

  function add(index, allowed) {
    if (!allowed || visited[index] || !mask[index]) return;
    visited[index] = 1;
    queue.push(index);
  }
}

function filterComponents(components, imageWidth, imageHeight) {
  const imageArea = imageWidth * imageHeight;
  const minArea = Math.max(600, imageArea * 0.003);
  const maxArea = imageArea * 0.75;
  const minSide = Math.max(24, Math.min(imageWidth, imageHeight) * 0.035);

  return components
    .filter(component => {
      const boxArea = component.width * component.height;
      const fillRatio = component.area / boxArea;
      if (component.area < minArea || component.area > maxArea) return false;
      if (component.width < minSide || component.height < minSide) return false;
      if (boxArea < imageArea * 0.004) return false;
      if (fillRatio > 0.92) return false;
      return true;
    })
    .sort((a, b) => b.area - a.area)
    .slice(0, 12)
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

function matchObject(object, collection) {
  const detectedFingerprint = buildDetectedFingerprint(object);
  const best = findBestMatch(detectedFingerprint, collection);
  return {
    reference: best?.reference || 'N/A',
    designation: best?.designation || 'Profil inconnu',
    score: best?.score || 0,
    boundingBox: { x: object.x, y: object.y, width: object.width, height: object.height }
  };
}

function buildDetectedFingerprint(object) {
  const ratio = object.width / object.height;
  return { width: object.width, height: object.height, ratio, normalizedRatio: ratio >= 1 ? ratio : 1 / ratio, area: object.area, fillRatio: object.area / (object.width * object.height) };
}
