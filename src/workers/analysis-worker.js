import { findTopMatches } from '../shape-engine/candidate-search.js';
import { buildUnifiedFingerprint } from '../shape-engine/fingerprint-pipeline.js';
import { normalizePipelineSettings } from '../shape-engine/pipeline-settings.js';
import { traceBoundary } from './contour-tracer.js';
import { getScaledImageData, buildGray, suppressTexture, blurGray } from './image-preprocessing.js';
import { buildRobustEdgeMask } from './robust-segmentation.js';
import { selectSectionCandidates } from './section-candidates.js';

const DEFAULT_SETTINGS = {
  image: { brightness: 0, contrast: 100, blurRadius: 1, textureSuppression: 0 },
  detection: { edgeQuantile: 0.82, linkRadius: 5, minAreaRatio: 0.0007, mergeGapRatio: 0.045 },
  weights: { ratio: 18, radial: 32, hu: 0, fourier: 8, angle: 28, fill: 4, minutiae: 10, localFeature: 14 },
  pipelineSettings: null
};

self.onmessage = async event => {
  const { type, imageBitmap, collection, settings } = event.data;
  if (type !== 'analyze') return;
  const activeSettings = mergeSettings(settings, collection);

  try {
    postProgress(10, 'Lecture de l image', `${imageBitmap.width} x ${imageBitmap.height} px`);
    const source = getScaledImageData(imageBitmap, 900);
    postProgress(24, 'Pretraitement', `Luminosite ${activeSettings.image.brightness} / contraste ${activeSettings.image.contrast} % / flou ${activeSettings.image.blurRadius} px / texture ${activeSettings.image.textureSuppression}`);
    const gray = buildGray(source.imageData, activeSettings.image);
    const denoised = suppressTexture(gray, source.width, source.height, activeSettings.image.textureSuppression);
    const blurred = blurGray(denoised, source.width, source.height, activeSettings.image.blurRadius);
    postProgress(40, 'Segmentation robuste', `Seuil dynamique : ${Math.round(activeSettings.detection.edgeQuantile * 100)} %`);
    const segmentation = buildRobustEdgeMask(blurred, source.width, source.height, activeSettings.detection);
    const edges = segmentation.mask;
    const edgePoints = sampleMaskPoints(edges, source.width, source.height, source.scale, 4500);
    postProgress(55, 'Connexion des contours', `${edgePoints.length} points contours visibles · mode ${segmentation.mode}`);
    const linkedEdges = dilate(edges, source.width, source.height, activeSettings.detection.linkRadius);
    postProgress(68, 'Recherche des sections', 'Selection des faces candidates');
    const components = findComponents(linkedEdges, source.width, source.height);
    postProgress(78, 'Score des sections', `${components.length} zones trouvees`);
    const objects = selectSectionCandidates(components, source.width, source.height, activeSettings.detection)
      .map(object => scaleDetectedObject(object, source.scale));
    postProgress(88, 'Comparaison avec la base', `${objects.length} sections candidates`);
    const items = await Promise.all(objects.map(object => matchObject(object, collection, activeSettings)));
    const debugPipeline = buildDebugPipeline({ imageBitmap, source, gray, denoised, blurred, activeSettings, segmentation, edgePoints, linkedEdges, components, objects, items });
    const debug = {
      edges: edgePoints,
      segmentation: segmentation.stats,
      segmentationMode: segmentation.mode,
      sectionCandidates: objects.map(object => ({
        x: object.x,
        y: object.y,
        width: object.width,
        height: object.height,
        score: object.sectionScore || 0,
        closed: object.closed
      })),
      contours: objects.map(object => ({
        closed: object.closed,
        sectionScore: object.sectionScore || 0,
        points: simplifyContourPoints(object.points, 180),
        holes: (object.holes || []).map(hole => ({ closed: hole.closed, points: simplifyContourPoints(hole.points, 120) }))
      })),
      debugPipeline
    };
    postProgress(96, 'Annotation', `${items.length} sections detectees`);
    self.postMessage({ width: imageBitmap.width, height: imageBitmap.height, preview: imageBitmap, items, settings: activeSettings, debug, debugPipeline }, [imageBitmap]);
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};

function mergeSettings(settings = {}, collection = null) {
  return {
    expectedReference: String(settings.expectedReference || '').trim(),
    image: {
      brightness: clampNumber(settings.image?.brightness, DEFAULT_SETTINGS.image.brightness, -100, 100),
      contrast: clampNumber(settings.image?.contrast, DEFAULT_SETTINGS.image.contrast, 0, 220),
      blurRadius: Math.round(clampNumber(settings.image?.blurRadius, DEFAULT_SETTINGS.image.blurRadius, 0, 5)),
      textureSuppression: Math.round(clampNumber(settings.image?.textureSuppression, DEFAULT_SETTINGS.image.textureSuppression, 0, 6))
    },
    detection: {
      edgeQuantile: clampNumber(settings.detection?.edgeQuantile, DEFAULT_SETTINGS.detection.edgeQuantile, 0.01, 0.99),
      linkRadius: Math.round(clampNumber(settings.detection?.linkRadius, DEFAULT_SETTINGS.detection.linkRadius, 1, 50)),
      minAreaRatio: clampNumber(settings.detection?.minAreaRatio, DEFAULT_SETTINGS.detection.minAreaRatio, 0, 0.05),
      mergeGapRatio: clampNumber(settings.detection?.mergeGapRatio, DEFAULT_SETTINGS.detection.mergeGapRatio, 0.001, 0.12)
    },
    weights: {
      ratio: clampNumber(settings.weights?.ratio, DEFAULT_SETTINGS.weights.ratio, 0, 100),
      radial: clampNumber(settings.weights?.radial, DEFAULT_SETTINGS.weights.radial, 0, 100),
      hu: 0,
      fourier: clampNumber(settings.weights?.fourier, DEFAULT_SETTINGS.weights.fourier, 0, 100),
      angle: clampNumber(settings.weights?.angle, DEFAULT_SETTINGS.weights.angle, 0, 100),
      fill: clampNumber(settings.weights?.fill, DEFAULT_SETTINGS.weights.fill, 0, 100),
      minutiae: clampNumber(settings.weights?.minutiae, DEFAULT_SETTINGS.weights.minutiae, 0, 100),
      localFeature: clampNumber(settings.weights?.localFeature, DEFAULT_SETTINGS.weights.localFeature, 0, 100)
    },
    pipelineSettings: normalizePipelineSettings(settings.pipelineSettings || collection?.pipelineSettings || {})
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
  if (!Array.isArray(points) || points.length <= maxPoints) return points || [];
  const contours = splitContours(points);
  const total = contours.reduce((sum, contour) => sum + contour.length, 0) || 1;
  const output = [];
  for (const contour of contours) {
    const count = Math.max(2, Math.round((contour.length / total) * maxPoints));
    const step = Math.max(1, contour.length / count);
    for (let i = 0; i < count && Math.floor(i * step) < contour.length; i++) {
      const point = contour[Math.floor(i * step)];
      output.push({ ...point, breakBefore: output.length > 0 && i === 0 });
    }
  }
  return output.slice(0, maxPoints);
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

function scaleDetectedObject(object, scale) {
  return {
    x: Math.round(object.x / scale),
    y: Math.round(object.y / scale),
    width: Math.round(object.width / scale),
    height: Math.round(object.height / scale),
    area: Math.round(object.area / (scale * scale)),
    closed: object.closed,
    sectionCandidate: object.sectionCandidate,
    sectionScore: object.sectionScore || 0,
    points: object.points.map(point => ({ x: Math.round(point.x / scale), y: Math.round(point.y / scale), breakBefore: Boolean(point.breakBefore) })),
    holes: (object.holes || []).map(hole => ({ closed: hole.closed, points: hole.points.map(point => ({ x: Math.round(point.x / scale), y: Math.round(point.y / scale), breakBefore: Boolean(point.breakBefore) })) }))
  };
}

function buildDebugPipeline({ imageBitmap, source, gray, denoised, blurred, activeSettings, segmentation, edgePoints, linkedEdges, components, objects, items }) {
  const firstItem = items[0]?.detectedFingerprintDebug || null;
  const visual = firstItem?.visualDescriptors || {};
  const minutiae = firstItem?.descriptorSamples?.minutiae || null;
  const localFeature = firstItem?.descriptorSamples?.localFeature || null;

  return {
    version: '1.3',
    source: {
      width: imageBitmap.width,
      height: imageBitmap.height,
      scaledWidth: source.width,
      scaledHeight: source.height,
      scale: source.scale
    },
    preprocessing: {
      settings: activeSettings.image,
      gray: summarizeArray(gray),
      denoised: summarizeArray(denoised),
      blurred: summarizeArray(blurred),
      denoisedApplied: activeSettings.image.textureSuppression > 0,
      blurRadius: activeSettings.image.blurRadius
    },
    segmentation: {
      settings: activeSettings.detection,
      mode: segmentation.mode,
      stats: segmentation.stats,
      sampledEdgePoints: edgePoints.length,
      edgePreview: samplePoints(edgePoints, 600)
    },
    contours: {
      count: objects.length,
      longJumps: objects.flatMap((object, index) => detectLongJumps(object.points).map(jump => ({ objectIndex: index, ...jump }))).slice(0, 80),
      previews: objects.slice(0, 8).map(object => ({
        closed: object.closed,
        sectionScore: object.sectionScore || 0,
        contourCount: splitContours(object.points).length,
        pointCount: object.points.length,
        points: samplePoints(object.points, 240),
        holes: (object.holes || []).map(hole => ({ closed: hole.closed, pointCount: hole.points.length, points: samplePoints(hole.points, 120) }))
      }))
    },
    resampling: {
      pointCount: firstItem?.normalizedPointCount || 0,
      points: visual.normalizedPoints || []
    },
    normalization: {
      summary: firstItem?.summary || null,
      descriptorSizes: firstItem?.descriptorSizes || null
    },
    radial: {
      values: visual.radial || []
    },
    fourier: {
      values: visual.fourier || []
    },
    minutiae,
    localFeature,
    linking: {
      linkRadius: activeSettings.detection.linkRadius,
      linkedEdgePixels: countMaskPixels(linkedEdges)
    },
    components: {
      count: components.length,
      preview: components.slice(0, 12).map(component => ({
        x: component.x,
        y: component.y,
        width: component.width,
        height: component.height,
        area: component.area,
        closed: component.closed,
        points: component.points.length,
        holes: component.holes.length
      }))
    },
    candidates: {
      count: objects.length,
      preview: objects.slice(0, 12).map(object => ({
        x: object.x,
        y: object.y,
        width: object.width,
        height: object.height,
        area: object.area,
        closed: object.closed,
        sectionScore: object.sectionScore || 0,
        points: object.points.length,
        contourCount: splitContours(object.points).length,
        holes: object.holes.length
      }))
    },
    matching: {
      count: items.length,
      topItems: items.slice(0, 8).map(item => ({
        reference: item.reference,
        score: item.score,
        sectionScore: item.sectionScore,
        detectedFingerprint: item.detectedFingerprintDebug || null,
        topCandidates: (item.topCandidates || []).slice(0, 5).map(candidate => ({ reference: candidate.reference, score: candidate.score }))
      }))
    }
  };
}

function summarizeFingerprint(fingerprint) {
  if (!fingerprint) return null;
  const descriptors = fingerprint.descriptors || {};
  return {
    version: fingerprint.version || null,
    reference: fingerprint.reference || null,
    summary: fingerprint.summary || null,
    valuesLength: Array.isArray(fingerprint.values) ? fingerprint.values.length : 0,
    normalizedPointCount: fingerprint.contour?.normalizedPoints?.length || 0,
    descriptorSizes: {
      radial: descriptors.radial?.length || 0,
      angleHistogram: descriptors.angleHistogram?.length || 0,
      hu: descriptors.hu?.length || 0,
      fourier: descriptors.fourier?.length || 0,
      points: descriptors.points?.length || 0,
      minutiae: summarizeDescriptorObject(descriptors.minutiae),
      localFeature: summarizeDescriptorObject(descriptors.localFeature)
    },
    descriptorSamples: {
      minutiae: descriptors.minutiae || null,
      localFeature: descriptors.localFeature || null
    },
    visualDescriptors: {
      radial: copyNumericArray(descriptors.radial, 128),
      angleHistogram: copyNumericArray(descriptors.angleHistogram, 128),
      hu: copyNumericArray(descriptors.hu, 16),
      fourier: copyNumericArray(descriptors.fourier, 128),
      values: copyNumericArray(fingerprint.values, 256),
      normalizedPoints: samplePoints(fingerprint.contour?.normalizedPoints || descriptors.points || [], 256)
    }
  };
}

function copyNumericArray(value, maxLength) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, maxLength).map(entry => Number.isFinite(Number(entry)) ? Math.round(Number(entry) * 1000000) / 1000000 : null);
}

function samplePoints(points, maxPoints) {
  if (!Array.isArray(points) || !points.length) return [];
  const contours = splitContours(points);
  const total = contours.reduce((sum, contour) => sum + contour.length, 0) || 1;
  const output = [];
  for (const contour of contours) {
    const count = Math.max(1, Math.round((contour.length / total) * maxPoints));
    const step = Math.max(1, Math.ceil(contour.length / count));
    for (let i = 0; i < contour.length; i += step) {
      const point = contour[i];
      const sampled = Array.isArray(point)
        ? { x: roundNumber(point[0]), y: roundNumber(point[1]) }
        : { x: roundNumber(point.x), y: roundNumber(point.y) };
      sampled.breakBefore = output.length > 0 && i === 0;
      output.push(sampled);
      if (output.length >= maxPoints) return output;
    }
  }
  return output;
}

function splitContours(points) {
  const contours = [];
  let current = [];
  for (const point of points || []) {
    if (point?.breakBefore && current.length) {
      contours.push(current);
      current = [];
    }
    current.push(point);
  }
  if (current.length) contours.push(current);
  return contours;
}

function detectLongJumps(points) {
  const jumps = [];
  const contours = splitContours(points);
  for (const contour of contours) {
    const distances = [];
    for (let i = 1; i < contour.length; i++) distances.push(Math.hypot(contour[i].x - contour[i - 1].x, contour[i].y - contour[i - 1].y));
    const median = percentile(distances, 0.5) || 1;
    for (let i = 1; i < contour.length; i++) {
      const distance = Math.hypot(contour[i].x - contour[i - 1].x, contour[i].y - contour[i - 1].y);
      if (distance > Math.max(12, median * 8)) {
        jumps.push({ from: contour[i - 1], to: contour[i], distance: Math.round(distance * 10) / 10, median: Math.round(median * 10) / 10 });
      }
    }
  }
  return jumps;
}

function percentile(values, ratio) {
  const sorted = values.filter(value => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  return sorted[Math.max(0, Math.min(sorted.length - 1, Math.floor(sorted.length * ratio)))];
}

function roundNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 1000000) / 1000000 : null;
}

function summarizeDescriptorObject(value) {
  if (!value || typeof value !== 'object') return null;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, Array.isArray(entry) ? entry.length : entry]));
}

function summarizeArray(arrayLike) {
  if (!arrayLike?.length) return null;
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  const step = Math.max(1, Math.ceil(arrayLike.length / 20000));
  let count = 0;
  for (let i = 0; i < arrayLike.length; i += step) {
    const value = arrayLike[i];
    min = Math.min(min, value);
    max = Math.max(max, value);
    sum += value;
    count++;
  }
  return { min, max, mean: count ? sum / count : 0, sampleCount: count };
}

function countMaskPixels(mask) {
  let count = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) count++;
  return count;
}

async function matchObject(object, collection, settings) {
  const detectedFingerprint = await buildUnifiedFingerprint({ kind: 'detected', object }, settings.pipelineSettings);
  const topCandidates = findTopMatches(detectedFingerprint, collection, settings.weights, 10);
  const best = topCandidates[0];
  return {
    reference: best?.reference || 'N/A',
    designation: best?.designation || 'Profil inconnu',
    score: best?.score || 0,
    scoreDetails: best?.scoreDetails || null,
    sectionScore: object.sectionScore || 0,
    topCandidates,
    boundingBox: { x: object.x, y: object.y, width: object.width, height: object.height },
    detectedFingerprintDebug: summarizeFingerprint(detectedFingerprint)
  };
}
