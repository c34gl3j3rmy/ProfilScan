import { findBestMatch } from '../shape-engine/candidate-search.js';

self.onmessage = async event => {
  const { type, imageBitmap, collection } = event.data;
  if (type !== 'analyze') return;

  try {
    postProgress(15, 'Lecture de l image', `${imageBitmap.width} x ${imageBitmap.height} px`);
    const imageData = getImageData(imageBitmap);

    postProgress(35, 'Seuillage', 'Recherche des pixels sombres');
    const mask = buildDarkMask(imageData);

    postProgress(55, 'Detection des composants', 'Separation des zones visibles');
    const components = findComponents(mask, imageData.width, imageData.height);

    postProgress(70, 'Filtrage des profils', `${components.length} zones trouvees`);
    const objects = filterComponents(components, imageData.width, imageData.height);

    postProgress(85, 'Comparaison avec la base', `${objects.length} profils candidats`);
    const items = objects.map(object => matchObject(object, collection));

    postProgress(95, 'Annotation', `${items.length} profils detectes`);
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

function buildDarkMask(imageData) {
  const { data, width, height } = imageData;
  const mask = new Uint8Array(width * height);
  for (let index = 0; index < width * height; index++) {
    const offset = index * 4;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    const contrast = Math.max(r, g, b) - Math.min(r, g, b);
    if (luminance < 105 && contrast < 80) mask[index] = 1;
  }
  return mask;
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
  const minSide = Math.max(10, Math.min(imageWidth, imageHeight) * 0.015);
  const minArea = Math.max(50, imageArea * 0.00008);
  const maxArea = imageArea * 0.12;

  return components.filter(component => {
    const boxArea = component.width * component.height;
    const fillRatio = component.area / boxArea;
    const touchesBorder = component.x < 3 || component.y < 3 || component.x + component.width > imageWidth - 3 || component.y + component.height > imageHeight - 3;
    if (touchesBorder) return false;
    if (component.area < minArea || component.area > maxArea) return false;
    if (component.width < minSide || component.height < minSide) return false;
    if (boxArea > imageArea * 0.35) return false;
    if (fillRatio > 0.85) return false;
    return true;
  }).sort((a, b) => a.y - b.y || a.x - b.x).slice(0, 30);
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
  return {
    width: object.width,
    height: object.height,
    ratio,
    normalizedRatio: ratio >= 1 ? ratio : 1 / ratio,
    area: object.area,
    fillRatio: object.area / (object.width * object.height)
  };
}
