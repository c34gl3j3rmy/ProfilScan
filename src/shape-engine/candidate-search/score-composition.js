import { computeHierarchicalBoost, computeLocalGate, computeRatioGate } from './advanced-scores.js';
import { clampScore } from './score-utils.js';

export const BASE_STAGE_WEIGHTS = Object.freeze({
  globalStage: 0.62,
  localStage: 0.38
});

export function combineBaseStages(globalStage, localStage) {
  return clampScore(
    numeric(globalStage) * BASE_STAGE_WEIGHTS.globalStage
    + numeric(localStage) * BASE_STAGE_WEIGHTS.localStage
  );
}

export function composeCandidateScore({
  baseSubscores = {},
  advancedSubscores = {},
  advancedRawScore = 0,
  advancedWeight = 0
} = {}) {
  const globalStage = numeric(baseSubscores.globalStage);
  const localStage = numeric(baseSubscores.localStage);
  const ratioGate = computeRatioGate(numeric(baseSubscores.ratio));
  const localGate = computeLocalGate(localStage);
  const advancedRaw = numeric(advancedRawScore);
  const advanced = advancedRaw * ratioGate * localGate;
  const baseStage = combineBaseStages(globalStage, localStage);
  const hierarchicalBoost = computeHierarchicalBoost(baseSubscores, advancedSubscores);
  const normalizedAdvancedWeight = clampAdvancedWeight(advancedWeight);
  const score = baseStage * (1 - normalizedAdvancedWeight)
    + advanced * normalizedAdvancedWeight
    + hierarchicalBoost;

  return {
    score: clampScore(score),
    baseStage,
    advanced,
    advancedRaw,
    ratioGate,
    localGate,
    hierarchicalBoost,
    advancedWeight: normalizedAdvancedWeight
  };
}

function clampAdvancedWeight(value) {
  return Math.max(0, Math.min(0.75, numeric(value)));
}

function numeric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}
