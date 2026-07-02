export async function loadImageFile(file) {
  if (!file) throw new Error('Aucun fichier image selectionne.');
  return createImageBitmap(file);
}
