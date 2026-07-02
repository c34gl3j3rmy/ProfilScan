export function findBestMatch(detectedFingerprint, collection) {
  if (!collection?.profiles?.length) return null;
  return collection.profiles[0];
}
