import { DEFAULT_PIPELINE_SETTINGS, normalizePipelineSettings, PIPELINE_VERSION } from '../shape-engine/pipeline-settings.js';

export const SETTINGS_PACKAGE_TYPE = 'ProfilScan optimized settings';
export const SETTINGS_SCHEMA_VERSION = '1.0';
export const ENGINE_VERSION = 'shape-engine-v3';
export const SETTINGS_STATUSES = Object.freeze([
  'local-experimental',
  'candidate',
  'validated-default'
]);

const DEFAULT_WEIGHTS = Object.freeze({
  ratio: 18,
  radial: 32,
  hu: 0,
  fourier: 8,
  angle: 28,
  fill: 4,
  minutiae: 10,
  localFeature: 14
});

export function createSettingsPackage({
  name = 'local-experimental',
  description = '',
  status = 'local-experimental',
  datasetVersion = null,
  baseFingerprint = null,
  pipeline = {},
  weights = {},
  modules = {},
  thresholds = {},
  benchmark = null,
  validation = null,
  source = {}
} = {}) {
  const normalizedStatus = SETTINGS_STATUSES.includes(status) ? status : 'local-experimental';
  return {
    type: SETTINGS_PACKAGE_TYPE,
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    status: normalizedStatus,
    name: String(name || normalizedStatus),
    description: String(description || ''),
    generatedAt: new Date().toISOString(),
    datasetVersion: datasetVersion || null,
    baseFingerprint: baseFingerprint || null,
    source: {
      kind: source.kind || 'pwa-local',
      label: source.label || 'ProfilScan PWA',
      appVersion: source.appVersion || null
    },
    settings: {
      pipeline: normalizePipelineSettings({ ...DEFAULT_PIPELINE_SETTINGS, ...pipeline }),
      weights: normalizeWeights({ ...DEFAULT_WEIGHTS, ...weights }),
      modules: normalizeModules(modules),
      thresholds: clonePlainObject(thresholds)
    },
    benchmark: benchmark ? clonePlainObject(benchmark) : null,
    validation: validation ? clonePlainObject(validation) : {
      status: normalizedStatus === 'candidate' ? 'pending' : 'local',
      notes: ''
    }
  };
}

export function validateSettingsPackage(value, context = {}) {
  const errors = [];
  const warnings = [];

  if (!value || typeof value !== 'object') return { valid: false, errors: ['package-missing'], warnings };
  if (value.type !== SETTINGS_PACKAGE_TYPE) errors.push('type-invalid');
  if (value.schemaVersion !== SETTINGS_SCHEMA_VERSION) errors.push('schema-version-incompatible');
  if (value.engineVersion !== ENGINE_VERSION) errors.push('engine-version-incompatible');
  if (!SETTINGS_STATUSES.includes(value.status)) errors.push('status-invalid');
  if (!value.settings || typeof value.settings !== 'object') errors.push('settings-missing');
  if (value.settings?.pipeline?.version && value.settings.pipeline.version !== PIPELINE_VERSION) warnings.push('pipeline-version-different');

  if (context.datasetVersion && value.datasetVersion && value.datasetVersion !== context.datasetVersion) {
    warnings.push('dataset-version-different');
  }
  if (context.baseFingerprint && value.baseFingerprint && value.baseFingerprint !== context.baseFingerprint) {
    warnings.push('base-fingerprint-different');
  }
  if (value.status === 'validated-default' && context.allowRepositoryDefault !== true) {
    warnings.push('validated-default-imported-as-candidate');
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function sanitizeImportedPackage(value, context = {}) {
  const validation = validateSettingsPackage(value, context);
  if (!validation.valid) return { package: null, ...validation };

  const importedStatus = value.status === 'validated-default' && context.allowRepositoryDefault !== true
    ? 'candidate'
    : value.status;

  const normalized = createSettingsPackage({
    name: value.name,
    description: value.description,
    status: importedStatus,
    datasetVersion: value.datasetVersion,
    baseFingerprint: value.baseFingerprint,
    pipeline: value.settings?.pipeline,
    weights: value.settings?.weights,
    modules: value.settings?.modules,
    thresholds: value.settings?.thresholds,
    benchmark: value.benchmark,
    validation: value.validation,
    source: value.source
  });
  normalized.generatedAt = value.generatedAt || normalized.generatedAt;
  normalized.importedAt = new Date().toISOString();

  return { package: normalized, ...validation };
}

export function compareSettingsPackages(left, right) {
  return {
    compatible: Boolean(left && right && left.schemaVersion === right.schemaVersion && left.engineVersion === right.engineVersion),
    metadata: {
      status: difference(left?.status, right?.status),
      datasetVersion: difference(left?.datasetVersion, right?.datasetVersion),
      baseFingerprint: difference(left?.baseFingerprint, right?.baseFingerprint)
    },
    pipeline: diffObjects(left?.settings?.pipeline || {}, right?.settings?.pipeline || {}),
    weights: diffObjects(left?.settings?.weights || {}, right?.settings?.weights || {}),
    modules: diffObjects(left?.settings?.modules || {}, right?.settings?.modules || {}),
    thresholds: diffObjects(left?.settings?.thresholds || {}, right?.settings?.thresholds || {})
  };
}

export function promotePackageToCandidate(value, validationReport = null) {
  const promoted = createSettingsPackage({
    ...value,
    status: 'candidate',
    pipeline: value?.settings?.pipeline,
    weights: value?.settings?.weights,
    modules: value?.settings?.modules,
    thresholds: value?.settings?.thresholds,
    benchmark: value?.benchmark,
    validation: validationReport || value?.validation,
    source: value?.source
  });
  promoted.name = value?.name || 'candidate';
  promoted.description = value?.description || '';
  promoted.validation = {
    ...(validationReport || value?.validation || {}),
    status: validationReport?.status || 'pending-review'
  };
  return promoted;
}

export function stableStringifySettingsPackage(value, spacing = 2) {
  return JSON.stringify(sortObject(value), null, spacing) + '\n';
}

function normalizeWeights(weights) {
  return Object.fromEntries(Object.entries(DEFAULT_WEIGHTS).map(([key, fallback]) => {
    const value = Number(weights?.[key]);
    return [key, Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : fallback];
  }));
}

function normalizeModules(modules) {
  const allowed = new Set(['experimental', 'validated', 'disabled', 'non-evaluable']);
  return Object.fromEntries(Object.entries(modules || {}).map(([key, value]) => [
    key,
    allowed.has(value) ? value : 'experimental'
  ]));
}

function clonePlainObject(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function diffObjects(left, right) {
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  return keys.map(key => ({
    key,
    left: left[key] ?? null,
    right: right[key] ?? null,
    changed: JSON.stringify(left[key] ?? null) !== JSON.stringify(right[key] ?? null)
  }));
}

function difference(left, right) {
  return { left: left ?? null, right: right ?? null, changed: left !== right };
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortObject(value[key])]));
}
