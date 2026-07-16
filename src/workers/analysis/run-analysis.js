import {
  getScaledImageData,
  buildGray,
  suppressTexture,
  blurGray
} from '../image-preprocessing.js';
import {
  buildFilledMaterialMask,
  buildRobustEdgeMask
} from '../robust-segmentation.js';
import { selectSectionCandidates } from '../section-candidates.js';
import {
  dilate,
  findComponents,
  sampleMaskPoints,
  scaleDetectedObject
} from './contour-utils.js';
import {
  buildDebugPipeline,
  buildDebugSummary
} from './debug-pipeline.js';
import { matchDetectedObject } from './matcher.js';

export async function runAnalysis({
  imageBitmap,
  collection,
  activeSettings,
  postProgress
}) {
  postProgress(
    10,
    'Lecture de l image',
    `${imageBitmap.width} x ${imageBitmap.height} px`
  );

  const source = getScaledImageData(imageBitmap, 900);

  postProgress(
    24,
    'Pretraitement',
    `Luminosite ${activeSettings.image.brightness}`
      + ` / contraste ${activeSettings.image.contrast} %`
      + ` / flou ${activeSettings.image.blurRadius} px`
      + ` / texture ${activeSettings.image.textureSuppression}`
  );

  const gray = buildGray(source.imageData, activeSettings.image);
  const denoised = suppressTexture(
    gray,
    source.width,
    source.height,
    activeSettings.image.textureSuppression
  );
  const blurred = blurGray(
    denoised,
    source.width,
    source.height,
    activeSettings.image.blurRadius
  );

  const useFilledMaterial =
    activeSettings.inputMode === 'filled-material'
    || Boolean(activeSettings.expectedReference);

  postProgress(
    40,
    useFilledMaterial
      ? 'Segmentation de la matiere'
      : 'Segmentation robuste',
    useFilledMaterial
      ? 'Masque noir rempli par seuil Otsu'
      : `Seuil dynamique : ${
          Math.round(activeSettings.detection.edgeQuantile * 100)
        } %`
  );

  const segmentation = useFilledMaterial
    ? buildFilledMaterialMask(
        blurred,
        source.width,
        source.height
      )
    : buildRobustEdgeMask(
        blurred,
        source.width,
        source.height,
        activeSettings.detection
      );

  const previewMask =
    segmentation.previewMask || segmentation.mask;

  const edgePoints = sampleMaskPoints(
    previewMask,
    source.width,
    source.height,
    source.scale,
    4500
  );

  postProgress(
    55,
    useFilledMaterial
      ? 'Masque de matiere'
      : 'Connexion des contours',
    `${edgePoints.length} points contours visibles`
      + ` · mode ${segmentation.mode}`
  );

  const linkedEdges = segmentation.filledMask
    ? segmentation.mask
    : dilate(
        segmentation.mask,
        source.width,
        source.height,
        activeSettings.detection.linkRadius
      );

  postProgress(
    68,
    'Recherche des sections',
    'Selection des faces candidates'
  );

  const components = findComponents(
    linkedEdges,
    source.width,
    source.height
  );

  postProgress(
    78,
    'Score des sections',
    `${components.length} zones trouvees`
  );

  const objects = selectSectionCandidates(
    components,
    source.width,
    source.height,
    activeSettings.detection
  ).map(object => scaleDetectedObject(object, source.scale));

  postProgress(
    88,
    'Comparaison avec la base',
    `${objects.length} sections candidates`
  );

  const items = await Promise.all(
    objects.map(object => matchDetectedObject(
      object,
      collection,
      activeSettings
    ))
  );

  const debugPipeline = buildDebugPipeline({
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
  });

  const debug = buildDebugSummary(
    objects,
    segmentation,
    edgePoints,
    debugPipeline
  );

  postProgress(
    96,
    'Annotation',
    `${items.length} sections detectees`
  );

  return {
    width: imageBitmap.width,
    height: imageBitmap.height,
    preview: imageBitmap,
    items,
    settings: activeSettings,
    debug,
    debugPipeline
  };
}
