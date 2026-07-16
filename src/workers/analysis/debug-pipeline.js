import {
  countMaskPixels,
  sampleContours,
  samplePoints,
  simplifyContourPoints
} from './contour-utils.js';
import { useInputMode } from './settings.js';

function summarizeArray(arrayLike) {
  const values = Array.from(arrayLike || []);
  if (!values.length) return null;

  let min = Infinity;
  let max = -Infinity;
  let sum = 0;

  for (const value of values) {
    min = Math.min(min, value);
    max = Math.max(max, value);
    sum += value;
  }

  return {
    min,
    max,
    mean: sum / values.length
  };
}

export function buildDebugPipeline({
  imageBitmap,
  source,
  gray,
  denoised,
  blurred,
  activeSettings,
  segmentation,
  edgePoints,
  linkedEdges,
  components,
  objects,
  items
}) {
  const firstItem = items[0]?.detectedFingerprintDebug || null;
  const visual = firstItem?.visualDescriptors || {};
  const minutiae = firstItem?.descriptorSamples?.minutiae || null;
  const localFeature =
    firstItem?.descriptorSamples?.localFeature || null;
  const structural =
    firstItem?.descriptorSamples?.structural || null;

  return {
    version: '2.2',

    source: {
      width: imageBitmap.width,
      height: imageBitmap.height,
      scaledWidth: source.width,
      scaledHeight: source.height,
      scale: source.scale,
      inputMode: useInputMode(activeSettings)
    },

    preprocessing: {
      settings: activeSettings.image,
      gray: summarizeArray(gray),
      denoised: summarizeArray(denoised),
      blurred: summarizeArray(blurred),
      denoisedApplied:
        activeSettings.image.textureSuppression > 0,
      blurRadius: activeSettings.image.blurRadius
    },

    segmentation: {
      settings: activeSettings.detection,
      mode: segmentation.mode,
      filledMask: Boolean(segmentation.filledMask),
      stats: segmentation.stats,
      sampledEdgePoints: edgePoints.length,
      edgePreview: samplePoints(edgePoints, 600)
    },

    contours: {
      count: objects.length,
      previews: objects.slice(0, 8).map(object => ({
        closed: object.closed,
        sectionScore: object.sectionScore || 0,
        contourCount: object.contours?.length || 0,
        pointCount: object.points.length,
        contours: sampleContours(object.contours || [], 240),
        points: samplePoints(object.points, 240),
        holes: (object.holes || []).map(hole => ({
          closed: hole.closed,
          contourCount: hole.contours?.length || 0,
          pointCount: hole.points.length,
          contours: sampleContours(hole.contours || [], 120),
          points: samplePoints(hole.points, 120)
        }))
      }))
    },

    resampling: {
      pointCount: firstItem?.normalizedPointCount || 0,
      points: visual.normalizedPoints || [],
      contours: visual.normalizedContours || []
    },

    normalization: {
      summary: firstItem?.summary || null,
      descriptorSizes: firstItem?.descriptorSizes || null
    },

    radial: { values: visual.radial || [] },
    fourier: { values: visual.fourier || [] },
    efd: { values: visual.efd || [] },
    minutiae,
    localFeature,
    structural,

    linking: {
      applied: !segmentation.filledMask,
      linkRadius: segmentation.filledMask
        ? 0
        : activeSettings.detection.linkRadius,
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
        contours: component.contours?.length || 0,
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
        contourCount: object.contours?.length || 0,
        holes: object.holes.length
      }))
    },

    matching: {
      count: items.length,
      topItems: items.slice(0, 8).map(item => ({
        reference: item.reference,
        score: item.score,
        sectionScore: item.sectionScore,
        detectedFingerprint:
          item.detectedFingerprintDebug || null,
        topCandidates: (item.topCandidates || [])
          .slice(0, 5)
          .map(candidate => ({
            reference: candidate.reference,
            score: candidate.score
          }))
      }))
    }
  };
}

export function buildDebugSummary(
  objects,
  segmentation,
  edgePoints,
  debugPipeline
) {
  return {
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
      contours: sampleContours(object.contours || [], 180),
      points: simplifyContourPoints(object.points, 180),
      holes: (object.holes || []).map(hole => ({
        closed: hole.closed,
        contours: sampleContours(hole.contours || [], 120),
        points: simplifyContourPoints(hole.points, 120)
      }))
    })),

    debugPipeline
  };
}
