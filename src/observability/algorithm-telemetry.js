const sessions = new Map();
const DEFAULT_SAMPLE_LIMIT = 512;

export function resetAlgorithmTelemetry() {
  sessions.clear();
}

export function recordAlgorithmMeasurement(id, measurement = {}) {
  const key = String(id || '').trim();
  if (!key) throw new Error('Identifiant d’algorithme manquant.');

  const state = sessions.get(key) || createState(key);
  const durationMs = finiteOrNull(measurement.durationMs);
  const outputSize = estimateOutputSize(measurement.output, measurement.outputSize);
  const score = finiteOrNull(measurement.score);

  state.calls += 1;
  state.errors += measurement.error ? 1 : 0;
  state.missing += measurement.missing ? 1 : 0;
  state.lastError = measurement.error ? String(measurement.error?.message || measurement.error) : state.lastError;
  state.lastUsedAt = new Date().toISOString();

  if (durationMs !== null) pushSample(state.durations, durationMs, state.sampleLimit);
  if (outputSize !== null) pushSample(state.outputSizes, outputSize, state.sampleLimit);
  if (score !== null) pushSample(state.scores, score, state.sampleLimit);

  if (measurement.decision === 'improved') state.improved += 1;
  else if (measurement.decision === 'degraded') state.degraded += 1;
  else if (measurement.decision === 'neutral') state.neutral += 1;

  sessions.set(key, state);
  return summarizeState(state);
}

export async function measureAlgorithm(id, operation, options = {}) {
  if (typeof operation !== 'function') throw new Error('Operation d’algorithme invalide.');
  const started = now();

  try {
    const output = await operation();
    recordAlgorithmMeasurement(id, {
      durationMs: now() - started,
      output,
      outputSize: options.outputSize,
      score: typeof options.score === 'function' ? options.score(output) : options.score,
      missing: output == null,
      decision: options.decision
    });
    return output;
  } catch (error) {
    recordAlgorithmMeasurement(id, {
      durationMs: now() - started,
      error,
      decision: options.decision
    });
    if (options.swallowErrors === true) return options.fallback ?? null;
    throw error;
  }
}

export function getAlgorithmTelemetry(id) {
  const state = sessions.get(String(id || '').trim());
  return state ? summarizeState(state) : null;
}

export function listAlgorithmTelemetry() {
  return Array.from(sessions.values())
    .map(summarizeState)
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function buildAlgorithmTelemetryReport(metadata = {}) {
  const algorithms = listAlgorithmTelemetry();
  return {
    type: 'ProfilScan algorithm telemetry report',
    version: 'algorithm-telemetry-v1',
    generatedAt: new Date().toISOString(),
    metadata: clonePlainObject(metadata),
    summary: {
      algorithms: algorithms.length,
      calls: algorithms.reduce((sum, item) => sum + item.calls, 0),
      errors: algorithms.reduce((sum, item) => sum + item.errors, 0),
      missing: algorithms.reduce((sum, item) => sum + item.missing, 0),
      totalMeasuredMs: round(algorithms.reduce((sum, item) => sum + (item.totalMs || 0), 0))
    },
    algorithms
  };
}

export function exportAlgorithmTelemetry(metadata = {}) {
  return JSON.stringify(buildAlgorithmTelemetryReport(metadata), null, 2) + '\n';
}

function createState(id) {
  return {
    id,
    calls: 0,
    errors: 0,
    missing: 0,
    improved: 0,
    degraded: 0,
    neutral: 0,
    durations: [],
    outputSizes: [],
    scores: [],
    sampleLimit: DEFAULT_SAMPLE_LIMIT,
    lastError: null,
    lastUsedAt: null
  };
}

function summarizeState(state) {
  const durations = [...state.durations].sort((a, b) => a - b);
  const outputSizes = [...state.outputSizes].sort((a, b) => a - b);
  const scores = [...state.scores];
  const totalMs = durations.reduce((sum, value) => sum + value, 0);
  const scoreVariance = variance(scores);

  return {
    id: state.id,
    calls: state.calls,
    errors: state.errors,
    missing: state.missing,
    errorRate: percent(state.errors, state.calls),
    missingRate: percent(state.missing, state.calls),
    timing: {
      totalMs: round(totalMs),
      meanMs: round(mean(durations)),
      medianMs: round(percentile(durations, 0.5)),
      p95Ms: round(percentile(durations, 0.95)),
      maxMs: round(durations.at(-1))
    },
    output: {
      meanSize: round(mean(outputSizes)),
      medianSize: round(percentile(outputSizes, 0.5)),
      p95Size: round(percentile(outputSizes, 0.95))
    },
    score: {
      samples: scores.length,
      mean: round(mean(scores)),
      variance: round(scoreVariance),
      constant: scores.length > 1 && scoreVariance === 0
    },
    decisions: {
      improved: state.improved,
      degraded: state.degraded,
      neutral: state.neutral,
      recommendation: recommendation(state)
    },
    lastError: state.lastError,
    lastUsedAt: state.lastUsedAt,
    totalMs: round(totalMs)
  };
}

function recommendation(state) {
  const decisions = state.improved + state.degraded + state.neutral;
  if (state.calls < 5 || decisions < 3) return 'insufficient-data';
  if (state.errors / Math.max(1, state.calls) > 0.1) return 'disable';
  if (state.degraded > state.improved * 1.5) return 'reduce';
  if (state.improved > state.degraded * 1.5) return 'increase';
  return 'keep';
}

function estimateOutputSize(output, explicitSize) {
  const explicit = finiteOrNull(explicitSize);
  if (explicit !== null) return explicit;
  if (output == null) return null;
  if (typeof output === 'string') return output.length;
  if (ArrayBuffer.isView(output)) return output.byteLength;
  if (output instanceof ArrayBuffer) return output.byteLength;
  if (Array.isArray(output)) return output.length;
  try {
    return new Blob([JSON.stringify(output)]).size;
  } catch {
    return null;
  }
}

function pushSample(target, value, limit) {
  target.push(value);
  if (target.length > limit) target.splice(0, target.length - limit);
}

function percentile(sortedValues, ratio) {
  if (!sortedValues.length) return null;
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil(sortedValues.length * ratio) - 1));
  return sortedValues[index];
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function variance(values) {
  if (values.length < 2) return null;
  const average = mean(values);
  return values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length;
}

function percent(value, total) {
  return total ? round(value / total * 100) : 0;
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value) {
  return Number.isFinite(value) ? Math.round(value * 10000) / 10000 : null;
}

function now() {
  return globalThis.performance?.now ? performance.now() : Date.now();
}

function clonePlainObject(value) {
  return JSON.parse(JSON.stringify(value || {}));
}
