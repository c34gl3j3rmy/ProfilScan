import { computeHierarchicalBoost, computeLocalGate, computeRatioGate } from './advanced-scores.js';
import { GLOBAL_WEIGHT_KEYS, LOCAL_WEIGHT_KEYS } from './weights.js';
import { clampScore, weightedAverage } from './score-utils.js';

export const BASE_STAGE_WEIGHTS = Object.freeze({
  globalStage: 0.62,
  localStage: 0.38
});

export function computeBaseStages(baseSubscores, baseWeights) {
  const globalStage = weightedAverage(baseSubscores, baseWeights, GLOBAL_WEIGHT_KEYS);
  const localStage = weightedAverage(baseSubscores, baseWeights, LOCAL_WEIGHT_KEYS);
  return {
    globalStage,
    localStage,
    baseStage: combineBaseStages(globalStage, localStage)
  };
}

export function combineBaseStages(globalStage, localStage) {
  return clampScore(
    numeric(globalStage) * BASE_STAGE_WEIGHTS.globalStage
    + numeric(localStage) * BASE_STAGE_WEIGHTS.localStage
  );
}

export function composeCandidateScore({
  baseSubscores = {},
  baseWeights = {},
  advancedSubscores = {},
  advancedRawScore = 0,
  advancedWeight = 0
} = {}) {
  const stages = computeBaseStages(baseSubscores, baseWeights);
  const ratioGate = computeRatioGate(numeric(baseSubscores.ratio));
  const localGate = computeLocalGate(stages.localStage);
  const advancedRaw = numeric(advancedRawScore);
  const advanced = advancedRaw * ratioGate * localGate;
  const hierarchicalBoost = computeHierarchicalBoost(baseSubscores, advancedSubscores);
  const normalizedAdvancedWeight = clampAdvancedWeight(advancedWeight);
  const score = stages.baseStage * (1 - normalizedAdvancedWeight)
    + advanced * normalizedAdvancedWeight
    + hierarchicalBoost;

  return {
    score: clampScore(score),
    ...stages,
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
