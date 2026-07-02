import { findBestMatch } from '../shape-engine/candidate-search.js';

self.onmessage = async event => {
  const { type, imageBitmap, collection } = event.data;
  if (type !== 'analyze') return;

  // Scaffold V1 : detection minimale factice pour valider le flux complet.
  // A remplacer par ImagePreprocessor + ObjectSegmenter + ShapeEngine.
  const candidates = collection?.profiles || [];
  const fallback = candidates[0] || { reference: 'N/A', designation: 'Base vide' };
  const item = {
    reference: fallback.reference,
    designation: fallback.designation,
    score: 0,
    boundingBox: {
      x: Math.round(imageBitmap.width * 0.15),
      y: Math.round(imageBitmap.height * 0.15),
      width: Math.round(imageBitmap.width * 0.7),
      height: Math.round(imageBitmap.height * 0.7)
    }
  };

  self.postMessage({
    width: imageBitmap.width,
    height: imageBitmap.height,
    preview: imageBitmap,
    items: [item]
  }, [imageBitmap]);
};
