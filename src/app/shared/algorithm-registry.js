function roundedScore(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
}

export const ALGORITHM_AUDIT_KEYS = [
  'globalStage',
  'localStage',
  'baseStage',
  'ratio',
  'radial',
  'hu',
  'fourier',
  'efd',
  'structural',
  'angle',
  'fill',
  'minutiae',
  'localFeature',
  'advanced',
  'advancedRaw',
  'ratioGate',
  'localGate',
  'hausdorff',
  'shapeContext',
  'icp',
  'ransac',
  'zernike'
];

export const ALGORITHM_LABELS = {
  globalStage: 'Etape globale',
  localStage: 'Etape locale',
  baseStage: 'Fusion globale + locale',
  ratio: 'Ratio largeur/hauteur',
  radial: 'Signature radiale',
  hu: 'Moments de Hu',
  fourier: 'Descripteurs de Fourier',
  efd: 'Descripteurs elliptiques de Fourier',
  structural: 'Signature structurelle',
  angle: 'Histogramme des angles',
  fill: 'Taux de remplissage',
  minutiae: 'Minuties',
  localFeature: 'Signature locale',
  advanced: 'Fusion avancee ponderee',
  advancedRaw: 'Fusion avancee brute',
  ratioGate: 'Garde-fou ratio',
  localGate: 'Garde-fou local',
  hausdorff: 'Distance de Hausdorff',
  shapeContext: 'Shape Context',
  icp: 'ICP',
  ransac: 'RANSAC lignes',
  zernike: 'Zernike-like'
};

function scoreValue(candidate, key) {
  if (!candidate) return null;
  if (key === 'score') return roundedScore(candidate.score);
  return roundedScore(candidate.scoreDetails?.subscores?.[key]);
}

function algorithmVerdict(delta) {
  if (!Number.isFinite(delta)) return 'unknown';
  if (delta >= 8) return 'strong-for-expected';
  if (delta > 0) return 'for-expected';
  if (delta <= -8) return 'strong-for-best';
  if (delta < 0) return 'for-best';
  return 'neutral';
}

export function buildAlgorithmAudit(best, expectedCandidate, expectedProfile) {
  const expectedReference = expectedProfile?.reference || '';
  const bestReference = best?.reference || '';
  const expectedFound = Boolean(expectedCandidate);

  const rows = ALGORITHM_AUDIT_KEYS.map(key => {
    const bestScore = scoreValue(best, key);
    const expectedScore = scoreValue(expectedCandidate, key);
    const delta = expectedFound
      && Number.isFinite(expectedScore)
      && Number.isFinite(bestScore)
      ? expectedScore - bestScore
      : null;

    return {
      key,
      label: ALGORITHM_LABELS[key] || key,
      bestScore,
      expectedScore: expectedFound ? expectedScore : null,
      delta,
      verdict: expectedFound
        ? algorithmVerdict(delta)
        : 'expected-not-in-top-candidates'
    };
  });

  return {
    expectedReference,
    bestReference,
    expectedFound,
    expectedWins: rows.filter(row => Number(row.delta) > 0).map(row => row.key),
    bestWins: rows.filter(row => Number(row.delta) < 0).map(row => row.key),
    neutral: rows.filter(row => row.delta === 0).map(row => row.key),
    rows
  };
}
