import {
  CANDIDATE_WEIGHT_PRESET_NAME,
  buildWeightPresetBenchmark
} from '../benchmark-weight-presets.js';
import {
  summarizeAlgorithmEffectiveness,
  summarizeGlobalAlgorithmVotes
} from './benchmark-algorithms.js';
import { percent, round } from './benchmark-utils.js';

export function buildBenchmarkReport({ startedAt, files, results, errors, collection }) {
  const summary = summarizeBenchmark(results, errors);
  const failures = results.filter(result => result.expectedKnownInBase && !result.success);
  const failureSummary = {
    outsideTop10: failures.filter(result => !result.top10).map(summarizeFailed