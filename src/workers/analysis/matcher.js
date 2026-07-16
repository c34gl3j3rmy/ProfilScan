import { findTopMatches } from '../../shape-engine/candidate-search.js';
import { buildUnifiedFingerprint } from '../../shape-engine/fingerprint-pipeline.js';
import { summarizeFingerprint } from './fingerprint-debug.js';

export async function matchDetectedObject(
  object,
  collection,
  settings
) {
  const fingerprint = await buildUnifiedFingerprint(
    { kind: 'detected', object },
    settings.pipelineSettings
  );

  const benchmarkMode = Boolean(settings.expectedReference);
  const candidateLimit = benchmarkMode
    ? Math.max(1, collection?.profiles?.length || 1)
    : 10;

  const top = findTopMatches(
    fingerprint,
    collection,
    settings.weights,
    candidateLimit
  );

  const winner = top[0] || {
    reference: '?',
    designation: 'Inconnu',
    score: 0,
    scoreDetails: null
  };

  return {
    ...winner,
    boundingBox: {
      x: object.x,
      y: object.y,
      width: object.width,
      height: object.height
    },
    sectionScore: object.sectionScore || 0,
    topCandidates: top,
    candidateCount: top.length,
    benchmarkMode,
    detectedFingerprintDebug: summarizeFingerprint(fingerprint)
  };
}
