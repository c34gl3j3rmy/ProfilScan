const VALID_STATUSES = new Set(['experimental', 'validated', 'disabled', 'non-evaluable']);
const VALID_STAGES = new Set(['preprocessing', 'segmentation', 'geometry', 'descriptor', 'matching', 'fusion', 'topology', 'postprocessing']);

const registry = new Map();

export function registerAlgorithm(definition) {
  const normalized = normalizeDefinition(definition);
  if (registry.has(normalized.id)) {
    const previous = registry.get(normalized.id);
    if (previous.version === normalized.version) return previous;
  }
  registry.set(normalized.id, Object.freeze(normalized));
  return registry.get(normalized.id);
}

export function unregisterAlgorithm(id) {
  return registry.delete(String(id || '').trim());
}

export function getAlgorithm(id) {
  return registry.get(String(id || '').trim()) || null;
}

export function listAlgorithms(options = {}) {
  const stage = options.stage || null;
  const statuses = options.statuses ? new Set(options.statuses) : null;
  return Array.from(registry.values())
    .filter(item => !stage || item.stage === stage)
    .filter(item => !statuses || statuses.has(item.status))
    .sort((a, b) => a.stage.localeCompare(b.stage) || a.id.localeCompare(b.id));
}

export function getEnabledAlgorithms() {
  return listAlgorithms().filter(item => !['disabled', 'non-evaluable'].includes(item.status));
}

export function getAlgorithmRegistrySnapshot() {
  return {
    version: 'algorithm-registry-v1',
    generatedAt: new Date().toISOString(),
    algorithms: listAlgorithms().map(item => ({
      id: item.id,
      label: item.label,
      version: item.version,
      stage: item.stage,
      status: item.status,
      requires: [...item.requires],
      produces: [...item.produces],
      benchmarkable: item.benchmarkable,
      observable: item.observable,
      tags: [...item.tags]
    }))
  };
}

export function validateAlgorithmDependencies(availableOutputs = []) {
  const available = new Set(availableOutputs);
  const rows = [];

  for (const algorithm of listAlgorithms()) {
    const missing = algorithm.requires.filter(requirement => !available.has(requirement));
    rows.push({
      id: algorithm.id,
      valid: missing.length === 0,
      missing
    });
    if (!missing.length) algorithm.produces.forEach(output => available.add(output));
  }

  return {
    valid: rows.every(row => row.valid),
    availableOutputs: Array.from(available).sort(),
    algorithms: rows
  };
}

function normalizeDefinition(definition = {}) {
  const id = String(definition.id || '').trim();
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(id)) {
    throw new Error('Identifiant d’algorithme invalide.');
  }

  const stage = VALID_STAGES.has(definition.stage) ? definition.stage : 'descriptor';
  const status = VALID_STATUSES.has(definition.status) ? definition.status : 'experimental';

  return {
    id,
    label: String(definition.label || id),
    version: String(definition.version || '1.0.0'),
    stage,
    status,
    requires: uniqueStrings(definition.requires),
    produces: uniqueStrings(definition.produces),
    benchmarkable: definition.benchmarkable !== false,
    observable: definition.observable !== false,
    tags: uniqueStrings(definition.tags),
    description: String(definition.description || ''),
    compare: typeof definition.compare === 'function' ? definition.compare : null,
    compute: typeof definition.compute === 'function' ? definition.compute : null,
    visualize: typeof definition.visualize === 'function' ? definition.visualize : null
  };
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(value => String(value).trim()).filter(Boolean))];
}

registerAlgorithm({ id: 'ratio', label: 'Ratio', version: '1.0.0', stage: 'descriptor', status: 'validated', requires: ['geometry'], produces: ['ratio'] });
registerAlgorithm({ id: 'radial', label: 'Signature radiale', version: '1.0.0', stage: 'descriptor', status: 'validated', requires: ['normalized-contours'], produces: ['radial-signature'] });
registerAlgorithm({ id: 'fourier', label: 'Fourier', version: '2.2.0', stage: 'descriptor', status: 'validated', requires: ['normalized-contours'], produces: ['fourier-signature'] });
registerAlgorithm({ id: 'angle', label: 'Histogramme d’angles', version: '1.0.0', stage: 'descriptor', status: 'validated', requires: ['normalized-contours'], produces: ['angle-signature'] });
registerAlgorithm({ id: 'fill', label: 'Remplissage', version: '1.0.0', stage: 'descriptor', status: 'validated', requires: ['filled-mask'], produces: ['fill-ratio'] });
registerAlgorithm({ id: 'hu', label: 'Moments de Hu', version: '1.0.0', stage: 'descriptor', status: 'non-evaluable', requires: ['filled-mask'], produces: ['hu-signature'] });
registerAlgorithm({ id: 'minutiae', label: 'Minuties', version: '1.0.0', stage: 'descriptor', status: 'validated', requires: ['normalized-contours'], produces: ['minutiae-signature'] });
registerAlgorithm({ id: 'localFeature', label: 'Détails locaux', version: '1.0.0', stage: 'descriptor', status: 'validated', requires: ['normalized-contours'], produces: ['local-feature-signature'] });
registerAlgorithm({ id: 'hausdorff', label: 'Hausdorff', version: '1.0.0', stage: 'matching', status: 'experimental', requires: ['normalized-contours'], produces: ['hausdorff-score'] });
registerAlgorithm({ id: 'shapeContext', label: 'Shape Context', version: '1.0.0', stage: 'matching', status: 'experimental', requires: ['normalized-contours'], produces: ['shape-context-score'] });
registerAlgorithm({ id: 'icp', label: 'ICP', version: '1.0.0', stage: 'matching', status: 'experimental', requires: ['normalized-contours'], produces: ['icp-score'] });
registerAlgorithm({ id: 'ransac', label: 'RANSAC', version: '1.0.0', stage: 'matching', status: 'disabled', requires: ['line-features'], produces: ['ransac-score'] });
registerAlgorithm({ id: 'zernike', label: 'Zernike', version: '1.0.0', stage: 'descriptor', status: 'experimental', requires: ['filled-mask'], produces: ['zernike-signature'] });
