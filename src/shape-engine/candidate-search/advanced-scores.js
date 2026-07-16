import { hausdorffScore } from '../hausdorff.js';
import { icpScore } from '../icp.js';
import { ransacLineScore } from '../ransac.js';
import { fuseScores } from '../score-fusion.js';
import { normalizePoints } from '../shape-normalizer.js';
import { shapeContextScore } from '../shape-context.js';
import { zernikeLikeScore } from '../zernike.js';
import { buildAlignmentVariants } from './alignment.js';
import { ADVANCED_WEIGHTS } from './weights.js';

export function compareAdvancedScores(detected, profile) {
  const detectedPoints = detected.descriptors?.points || detected.contour?.normalizedPoints;
  const referencePoints = profile.dna?.contour?.normalizedPoints || profile.fingerprint?.descriptors?.points;
  if (!detectedPoints?.length || !referencePoints?.length) return null;

  const target = normalizePoints(referencePoints);
  const variants = buildAlignmentVariants(normalizePoints(detectedPoints));
  let best = null;

  for (const variant of variants) {
    const candidate = fuseScores(
      {
        hausdorff: hausdorffScore(variant.points, target),
        shapeContext: shapeContextScore(variant.points, target),
        icp: icpScore(variant.points, target),
        ransac: Math.min(ransacLineScore(variant.points), ransacLineScore(target)),
        zernike: zernikeLikeScore(variant.points, target)
      },
      ADVANCED_WEIGHTS
    );

    if (!best || candidate.score > best.score) {
      best = { ...candidate, alignment: variant.name };
    }
  }

  return best;
}

export function computeHierarchicalBoost(baseScores, advancedScores) {
  const local = Number(baseScores.localFeature) || 0;
  const minutiae = Number(baseScores.minutiae) || 0;
  const radial = Number(baseScores.radial) || 0;
  const angle = Number(baseScores.angle) || 0;
  const hausdorff = Number(advancedScores.hausdorff) || 0;
  const icp = Number(advancedScores.icp) || 0;
  const strongLocalAgreement = [local, minutiae, radial, angle, hausdorff, icp].filter(value => value >= 88).length;
  if (strongLocalAgreement >= 5) return 3;
  if (strongLocalAgreement >= 4) return 1.8;
  if (strongLocalAgreement >= 3) return 0.8;
  return 0;
}

export function computeRatioGate(ratioScore) {
  if (!Number.isFinite(ratioScore)) return 1;
  if (ratioScore >= 85) return 1;
  if (ratioScore >= 70) return 0.85;
  if (ratioScore >= 55) return 0.65;
  return 0.45;
}

export function computeLocalGate(localStage) {
  if (!Number.isFinite(localStage)) return 1;
  if (localStage >= 82) return 1;
  if (localStage >= 68) return 0.90;
  if (localStage >= 55) return 0.72;
  return 0.50;
}
