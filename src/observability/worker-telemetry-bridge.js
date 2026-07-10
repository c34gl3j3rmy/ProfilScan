const MAX_REPORTS = 200;
const reports = [];
const listeners = new Set();

installWorkerBridge();

export function getWorkerObservabilityReports() {
  return reports.map(clonePlainObject);
}

export function clearWorkerObservabilityReports() {
  reports.length = 0;
  notifyListeners();
}

export function getWorkerObservabilitySnapshot() {
  const telemetryReports = reports.map(item => item.telemetry).filter(Boolean);
  const consistencyReports = reports.map(item => item.consistency).filter(Boolean);
  const algorithms = aggregateTelemetry(telemetryReports);

  return {
    type: 'ProfilScan worker observability snapshot',
    version: 'worker-observability-bridge-v1',
    generatedAt: new Date().toISOString(),
    summary: {
      reports: reports.length,
      telemetryReports: telemetryReports.length,
      consistencyReports: consistencyReports.length,
      algorithms: algorithms.length,
      calls: algorithms.reduce((sum, item) => sum + item.calls, 0),
      errors: algorithms.reduce((sum, item) => sum + item.errors, 0),
      divergences: consistencyReports.reduce((sum, report) => sum + Number(report.different || 0), 0)
    },
    algorithms,
    consistency: aggregateConsistency(consistencyReports),
    reports: getWorkerObservabilityReports()
  };
}

export function subscribeWorkerObservability(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function installWorkerBridge() {
  if (typeof globalThis.Worker !== 'function' || globalThis.__profilScanWorkerBridgeInstalled) return;

  const NativeWorker = globalThis.Worker;
  class ObservableWorker extends NativeWorker {
    constructor(url, options) {
      super(url, options);
      this.addEventListener('message', event => ingestWorkerMessage(event.data));
    }
  }

  Object.defineProperty(globalThis, 'Worker', {
    configurable: true,
    writable: true,
    value: ObservableWorker
  });
  globalThis.__profilScanWorkerBridgeInstalled = true;
}

function ingestWorkerMessage(message) {
  if (!message || message.type === 'progress' || message.type === 'error') return;
  const items = Array.isArray(message.items) ? message.items : [];

  for (const item of items) {
    const summary = item?.detectedFingerprintDebug?.summary;
    const telemetry = summary?.observabilityTelemetry || null;
    const consistency = summary?.descriptorConsistency || null;
    if (!telemetry && !consistency) continue;

    reports.push({
      receivedAt: new Date().toISOString(),
      reference: item.reference || null,
      score: finiteOrNull(item.score),
      telemetry: telemetry ? clonePlainObject(telemetry) : null,
      consistency: consistency ? clonePlainObject(consistency) : null
    });
  }

  if (reports.length > MAX_REPORTS) reports.splice(0, reports.length - MAX_REPORTS);
  if (items.length) notifyListeners();
}

function aggregateTelemetry(telemetryReports) {
  const map = new Map();

  for (const report of telemetryReports) {
    for (const algorithm of report.algorithms || []) {
      const current = map.get(algorithm.id) || {
        id: algorithm.id,
        calls: 0,
        errors: 0,
        missing: 0,
        totalMeasuredMs: 0,
        weightedMeanMs: 0,
        p95Ms: 0,
        improved: 0,
        degraded: 0,
        neutral: 0
      };
      const calls = Number(algorithm.calls) || 0;
      current.calls += calls;
      current.errors += Number(algorithm.errors) || 0;
      current.missing += Number(algorithm.missing) || 0;
      current.totalMeasuredMs += Number(algorithm.timing?.totalMs ?? algorithm.totalMs) || 0;
      current.weightedMeanMs += (Number(algorithm.timing?.meanMs) || 0) * calls;
      current.p95Ms = Math.max(current.p95Ms, Number(algorithm.timing?.p95Ms) || 0);
      current.improved += Number(algorithm.decisions?.improved) || 0;
      current.degraded += Number(algorithm.decisions?.degraded) || 0;
      current.neutral += Number(algorithm.decisions?.neutral) || 0;
      map.set(algorithm.id, current);
    }
  }

  return Array.from(map.values())
    .map(item => ({
      id: item.id,
      calls: item.calls,
      errors: item.errors,
      missing: item.missing,
      errorRate: percent(item.errors, item.calls),
      missingRate: percent(item.missing, item.calls),
      timing: {
        totalMs: round(item.totalMeasuredMs),
        meanMs: item.calls ? round(item.weightedMeanMs / item.calls) : null,
        p95Ms: round(item.p95Ms)
      },
      decisions: {
        improved: item.improved,
        degraded: item.degraded,
        neutral: item.neutral,
        recommendation: recommendation(item)
      }
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function aggregateConsistency(consistencyReports) {
  const map = new Map();

  for (const report of consistencyReports) {
    for (const row of report.rows || []) {
      const current = map.get(row.target) || {
        target: row.target,
        reports: 0,
        equal: 0,
        different: 0,
        missing: 0,
        maxAbsoluteError: 0
      };
      current.reports += 1;
      current.equal += row.status === 'equal' ? 1 : 0;
      current.different += row.status === 'different' ? 1 : 0;
      current.missing += row.status === 'missing' ? 1 : 0;
      current.maxAbsoluteError = Math.max(current.maxAbsoluteError, Number(row.maxAbsoluteError) || 0);
      map.set(row.target, current);
    }
  }

  return Array.from(map.values())
    .map(item => ({
      ...item,
      equalityRate: percent(item.equal, item.equal + item.different),
      readyForMigration: item.reports >= 5 && item.different === 0 && item.missing === 0
    }))
    .sort((a, b) => a.target.localeCompare(b.target));
}

function recommendation(item) {
  const decisions = item.improved + item.degraded + item.neutral;
  if (item.calls < 5 || decisions < 3) return 'insufficient-data';
  if (item.errors / Math.max(1, item.calls) > 0.1) return 'disable';
  if (item.degraded > item.improved * 1.5) return 'reduce';
  if (item.improved > item.degraded * 1.5) return 'increase';
  return 'keep';
}

function notifyListeners() {
  const snapshot = getWorkerObservabilitySnapshot();
  listeners.forEach(listener => {
    try { listener(snapshot); } catch (error) { console.warn('Observability listener failed', error); }
  });
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

function clonePlainObject(value) {
  return JSON.parse(JSON.stringify(value || {}));
}
