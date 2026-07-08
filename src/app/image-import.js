import { isSvgFile, renderSvgFileToBitmap } from './svg-rasterizer.js';

export async function loadImageFile(file) {
  if (!file) throw new Error('Aucun fichier image selectionne.');
  if (isSvgFile(file)) return renderSvgFileToBitmap(file);
  return createImageBitmap(file);
}
