const reportButton = document.querySelector('#copyAnalysisReportButton');

reportButton?.addEventListener('click', event => {
  event.preventDefault();
  event.stopImmediatePropagation();

  const result = window.__profilScanLastResult;
  if (!result) {
    setButtonText('Aucun rapport disponible');
    return;
  }

  const report = buildSingleAnalysisReport(result);
  saveJsonFile(report, 'profilscan-analyse-' + timestampForFile() + '.json');
  setButtonText('Rapport telecharge');
}, true);

function buildSingleAnalysisReport(result) {
  const best = result.items?.[0] || null;
  const expectedReference = document.querySelector('#expectedProfileInput')?.value?.trim() || '';
  const topCandidates = (best?.topCandidates || []).slice(0, 20).map((candidate, index) => ({
    rank: index + 1,
    reference: candidate.reference,
    designation: candidate.designation,
    score: round(candidate.score),
    scoreDetails: candidate.scoreDetails || null
  }));
  const expectedCandidate = expectedReference
    ? findExpectedCandidate(result, expectedReference)
    : null;

  return {
    type: 'ProfilScan single image analysis report',
    version: 'single-analysis-download-v1',
    generatedAt: new Date().toISOString(),
    expectedReference,
    image: {
      width: result.width,
      height: result.height,
      detectedItems: result.items?.length || 0,
      contours: result.debug?.contours?.length || 0,
      holes: (result.debug?.contours || []).reduce((sum, contour) => sum + (contour.holes?.length || 0), 0)
    },
    settings: result.settings || null,
    segmentation: {
      mode: result.debug?.segmentationMode || null,
      stats: result.debug?.segmentation || null
    },
    bestMatch: best,
    expectedCandidate,
    topCandidates,
    detectedSignature: {
      scoreDetails: best?.scoreDetails || null,
      boundingBox: best?.boundingBox || null,
      debugContours: (result.debug?.contours || []).slice(0, 3)
    },
    debug: {
      sectionCandidates: result.debug?.sectionCandidates || [],
      contours: (result.debug?.contours || []).slice(0, 10)
    }
  };
}

function findExpectedCandidate(result, expectedReference) {
  const target = String(expectedReference || '').trim().toLowerCase();
  for (const [itemIndex, item] of (result.items || []).entries()) {
    const candidateIndex = item.topCandidates?.findIndex(candidate => String(candidate.reference || '').trim().toLowerCase() === target) ?? -1;
    if (candidateIndex >= 0) {
      const candidate = item.topCandidates[candidateIndex];
      return {
        ...candidate,
        detectedItemIndex: itemIndex,
        candidateRank: candidateIndex + 1
      };
    }
  }
  return null;
}

function saveJsonFile(data, fileName) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

function setButtonText(text) {
  if (!reportButton) return;
  reportButton.textContent = text;
  setTimeout(() => { reportButton.textContent = 'Telecharger rapport'; }, 1400);
}

function timestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function round(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
}
