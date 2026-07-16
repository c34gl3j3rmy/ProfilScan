import { escapeHtml, sameReference } from './shared/common-utils.js';

export function findProfile(collection, reference) {
  if (!reference) return null;
  return collection?.profiles?.find(
    profile => sameReference(profile.reference, reference)
  ) || null;
}

export function populateProfileReferenceList(collection, listNode) {
  if (!listNode || !collection?.profiles?.length) return;

  listNode.innerHTML = collection.profiles
    .map(profile => (
      `<option value="${escapeHtml(profile.reference)}">`
      + `${escapeHtml(profile.designation || '')}</option>`
    ))
    .join('');
}

export function findCandidate(result, reference) {
  const target = String(reference || '').trim().toLowerCase();

  for (const [itemIndex, item] of (result?.items || []).entries()) {
    const candidateIndex = item.topCandidates?.findIndex(
      entry => String(entry.reference || '').trim().toLowerCase() === target
    ) ?? -1;

    if (candidateIndex >= 0) {
      return {
        ...item.topCandidates[candidateIndex],
        detectedItemIndex: itemIndex,
        candidateRank: candidateIndex + 1
      };
    }
  }

  return null;
}
