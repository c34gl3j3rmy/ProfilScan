import { findBestMatch } from '../shape-engine/candidate-search.js';
import { buildDetectedFingerprintFromPoints } from '../shape-engine/signature-builder.js';

self.onmessage = async event => {
  const { type, imageBitmap, collection } = event.data;
  if (type !== 'analyze') return;

  try {
    postProgress(10, 'Lecture de l image', `${imageBitmap.width} x ${imageBitmap.height} px`);
    const source = getScaledImageData(imageBitmap, 900);

    postProgress(24, 'Pretraitement', `Image de travail : ${source.width} x ${source.height} px`);
    const gray = buildGray(source.imageData);
    const blurred = blurGray(gray, source.width, source.height);

    postProgress(40, 'Detection des contours', 'Calcul des gradients Sobel');
    const edges = buildEdgeMask(blurred, source.width, source.height);

    postProgress(55, 'Renforcement des formes', 'Connexion des aretes proches');
    const linkedEdges = morphClose(edges, source.width, source.height, 5, 2);

    postProgress(68, 'Recherche des objets', 'Composants connexes');
    const components = findComponents(linkedEdges, source.width, source.height);

    postProgress(78, 'Extraction des contours', `${components.length} zones trouvees`);
    const objects = filterAndMergeComponents(components, source.width, source.height)
      .map(object => scaleDetectedObject(object, source.scale));

    postProgress(88, 'Comparaison avec la base', `${objects.length} contours candidats`);
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

function getScaledImageData(imageBitmap, maxSize) {
  const scale = Math.min(1, maxSize / Math.max(imageBitmap.width, imageBitmap.height));
  const width = Math.max(1, Math.round(imageBitmap.width * scale));
  const height = Math.max(1, Math.round(imageBitmap.height * scale));
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(imageBitmap, 0, 0, width, height);
  return { imageData: ctx.getImageData(0, 0, width, height), width, height, scale };
}

function buildGray(imageData) {
  const { data, width, height } = imageData;
  const gray = new Uint8Array(width * height);
  for (let index = 0; index < gray.length; index++) {
    const offset = index * 4;
    gray[index] = Math.round(0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2]);
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

function buildEdgeMask(gray, width, height) {
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
  const autoThreshold = samples[Math.floor(samples.length * 0.82)] || 60;
  const threshold = Math.max(45, Math.min(180, autoThreshold));
  const mask = new Uint8Array(width * height);

  for (let i = 0; i < magnitudes.length; i++) {
    if (magnitudes[i] >= threshold) mask[i] = 1;
  }
  return mask;
}

function morphClose(mask, width, height, dilateRadius, erodeRadius) {
  return erode(dilate(mask, width, height, dilateRadius), width, height, erodeRadius);
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
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || xx >= width || yy < 0 || yy >= height) continue;
          const next = yy * width + xx;
          if (!visited[next] && mask[next]) {
            visited[next] = 1;
            queue.push(next);
          }
        }
      }
    }

    components.push({
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
      area: count,
      points: simplifyContourPoints(extractBoundaryPoints(pixels, mask, width, height), 240)
    });
  }

  return components;
}

function extractBoundaryPoints(pixels, mask, width, height) {
  const boundary = [];
  for (const point of pixels) {
    let edge = false;
    for (let dy = -1; dy <= 1 && !edge; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const xx = point.x + dx;
        const yy = point.y + dy;
        if (xx < 0 || xx >= width || yy < 0 || yy >= height || !mask[yy * width + xx]) {
          edge = true;
          break;
        }
      }
    }
    if (edge) boundary.push(point);
  }
  return sortContourPoints(boundary);
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
  for (let i = 0; i < maxPoints; i++) {
    output.push(points[Math.floor(i * step)]);
  }
  return output;
}

function filterAndMergeComponents(components, imageWidth, imageHeight) {
  const imageArea = imageWidth * imageHeight;
  const minArea = Math.max(180, imageArea * 0.0007);
  const minSide = Math.max(18, Math.min(imageWidth, imageHeight) * 0.025);

  const candidates = components.filter(component => {
    const boxArea = component.width * component.height;
    if (component.area < minArea) return false;
    if (component.width < minSide || component.height < minSide) return false;
    if (boxArea > imageArea * 0.9) return false;
    return true;
  });

  const gap = Math.max(18, Math.min(imageWidth, imageHeight) * 0.045);
  const groups = [];
  for (const component of candidates) {
    const group = groups.find(existing => areNear(existing, component, gap));
    if (!group) {
      groups.push({ ...component, points: [...component.points] });
    } else {
      const maxX = Math.max(group.x + group.width, component.x + component.width);
      const maxY = Math.max(group.y + group.height, component.y + component.height);
      group.x = Math.min(group.x, component.x);
      group.y = Math.min(group.y, component.y);
      group.width = maxX - group.x;
      group.height = maxY - group.y;
      group.area += component.area;
      group.points = simplifyContourPoints([...group.points, ...component.points], 320);
    }
  }

  return groups
    .filter(group => group.width * group.height > imageArea * 0.01)
    .map(group => ({ ...group, points: simplifyContourPoints(sortContourPoints(group.points), 240) }))
    .sort((a, b) => b.width * b.height - a.width * a.height)
    .slice(0, 10)
    .sort((a, b) => a.y - b.y || a.x - b.x);
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
    points: object.points.map(point => ({ x: Math.round(point.x / scale), y: Math.round(point.y / scale) }))
  };
}

function matchObject(object, collection) {
  const detectedFingerprint = buildDetectedFingerprintFromPoints(object);
  const best = findBestMatch(detectedFingerprint, collection);
  return {
    reference: best?.reference || 'N/A',
    designation: best?.designation || 'Profil inconnu',
    score: best?.score || 0,
    scoreDetails: best?.scoreDetails || null,
    boundingBox: { x: object.x, y: object.y, width: object.width, height: object.height }
  };
}
