export function createConsistencyCollector(metadata = {}) {
  const reports = [];

  return {
    add(report, context = {}) {
      if (!report) return null;
      const row = {
        context: sanitizeContext(context),
        report
      };
      reports.push(row);
      return row;
    },

    clear() {
      reports.length = 0;
    },

    size() {
      return reports.length;
    },

    build() {
      return buildDescriptorConsistencyReport(reports, metadata);
    },

    toJSON() {
      return JSON.stringify(buildDescriptorConsistencyReport(reports, metadata), null, 2) + '\n';
    }
  };
}

export function buildDescriptorConsistencyReport(entries = [], metadata = {}) {
  const normalizedEntries = normalizeEntries(entries);
  const perDescriptor = new Map();
  const executionErrors = [];

  for (const entry of normalizedEntries) {
    const report = entry.report;

    for (const error of report.errors || []) {
      executionErrors.push({
        ...error,
        context: entry.context
      });
    }

    for (const row of report.rows || []) {
      const current = perDescriptor.get(row.target) || createDescriptorState(row.target);
      current.samples += Number(row.samples) || 0;
      current.reports += 1;
      current.equal += row.status === 'equal' ? 1 : 0;
      current.different += row.status === 'different' ? 1 : 0;
      current.missing += row.status === 'missing' ? 1 : 0;

      if (Number.isFinite(Number(row.maxAbsoluteError))) {
        current.maxAbsoluteError = Math.max(current.maxAbsoluteError, Number(row.maxAbsoluteError));
        current.maxErrorContext = row.maxAbsoluteError >= current.maxAbsoluteError
          ? entry.context
          : current.maxErrorContext;
      }

      if (Number.isFinite(Number(row.meanAbsoluteError))) {
        current.meanErrorSum += Number(row.meanAbsoluteError);
        current.meanErrorCount += 1;
      }

      perDescriptor.set(row.target, current);
    }
  }

  const descriptors = Array.from(perDescriptor.values())
    .map(finalizeDescriptorState)
    .sort((a, b) => a.target.localeCompare(b.target));

  const summary = {
    reports: normalizedEntries.length,
    validReports: normalizedEntries.filter(entry => entry.report.valid).length,
    invalidReports: normalizedEntries.filter(entry => !entry.report.valid).length,
    descriptors: descriptors.length,
    equal: descriptors.reduce((sum, item) => sum + item.equal, 0),
    different: descriptors.reduce((sum, item) => sum + item.different, 0),
    missing: descriptors.reduce((sum, item) => sum + item.missing, 0),
    executionErrors: executionErrors.length,
    migrationReady: descriptors.length > 0
      && descriptors.every(item => item.readyForMigration)
      && executionErrors.length === 0
  };

  return {
    type: 'ProfilScan descriptor consistency report',
    version: 'descriptor-consistency-report-v1',
    generatedAt: new Date().toISOString(),
    metadata: clonePlainObject(metadata),
    summary,
    descriptors,
    executionErrors,
    failures: normalizedEntries
      .filter(entry => !entry.report.valid || entry.report.different > 0 || entry.report.errors?.length)
      .map(entry => ({
        context: entry.context,
        valid: Boolean(entry.report.valid),
        different: entry.report.different || 0,
        missing: entry.report.missing || 0,
        rows: (entry.report.rows || []).filter(row => row.status !== 'equal'),
        errors: entry.report.errors || []
      }))
  };
}

export function mergeConsistencyReports(reports = [], metadata = {}) {
  const entries = reports.flatMap(report => {
    if (!report) return [];
    if (report.type === 'ProfilScan descriptor consistency report') {
      return (report.failures || []).map(failure => ({
        context: failure.context,
        report: {
          valid: failure.valid,
          different: failure.different,
          missing: failure.missing,
          rows: failure.rows,
          errors: failure.errors
        }
      }));
    }
    return [{ context: {}, report }];
  });

  return buildDescriptorConsistencyReport(entries, metadata);
}

function normalizeEntries(entries) {
  return (entries || []).flatMap(entry => {
    if (!entry) return [];
    if (entry.report) {
      return [{
        context: sanitizeContext(entry.context),
        report: entry.report
      }];
    }
    return [{ context: {}, report: entry }];
  });
}

function createDescriptorState(target) {
  return {
    target,
    reports: 0,
    samples: 0,
    equal: 0,
    different: 0,
    missing: 0,
    maxAbsoluteError: 0,
    maxErrorContext: null,
    meanErrorSum: 0,
    meanErrorCount: 0
  };
}

function finalizeDescriptorState(state) {
  const evaluated = state.equal + state.different;
  const equalityRate = evaluated ? state.equal / evaluated * 100 : 0;
  const missingRate = state.reports ? state.missing / state.reports * 100 : 0;
  const meanAbsoluteError = state.meanErrorCount
    ? state.meanErrorSum / state.meanErrorCount
    : null;

  return {
    target: state.target,
    reports: state.reports,
    samples: state.samples,
    equal: state.equal,
    different: state.different,
    missing: state.missing,
    equalityRate: round(equalityRate),
    missingRate: round(missingRate),
    maxAbsoluteError: round(state.maxAbsoluteError),
    meanAbsoluteError: round(meanAbsoluteError),
    maxErrorContext: state.maxErrorContext,
    readyForMigration: state.reports >= 5
      && state.different === 0
      && state.missing === 0
      && equalityRate === 100,
    recommendation: recommendation({
      reports: state.reports,
      different: state.different,
      missing: state.missing,
      equalityRate
    })
  };
}

function recommendation(state) {
  if (state.reports < 5) return 'collect-more-data';
  if (state.different > 0) return 'keep-legacy-and-investigate';
  if (state.missing > 0) return 'fix-missing-runtime-output';
  if (state.equalityRate === 100) return 'ready-for-migration';
  return 'keep-legacy';
}

function sanitizeContext(context) {
  const source = context && typeof context === 'object' ? context : {};
  return {
    fileName: source.fileName || null,
    reference: source.reference || source.expectedReference || null,
    sourceKind: source.sourceKind || null,
    pipelineMode: source.pipelineMode || null
  };
}

function clonePlainObject(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function round(value) {
  return Number.isFinite(value) ? Math.round(value * 1e10) / 1e10 : null;
}
