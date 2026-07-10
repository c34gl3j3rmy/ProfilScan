import { getAlgorithm, listAlgorithms } from './algorithm-registry.js';
import { measureAlgorithm } from './algorithm-telemetry.js';

const DEFAULT_ALLOWED_STATUSES = new Set(['validated', 'experimental']);

export function buildExecutionPlan({
  targets = [],
  availableOutputs = [],
  allowedStatuses = DEFAULT_ALLOWED_STATUSES
} = {}) {
  const requestedTargets = uniqueStrings(targets);
  const available = new Set(uniqueStrings(availableOutputs));
  const allowed = allowedStatuses instanceof Set ? allowedStatuses : new Set(allowedStatuses || []);
  const selected = new Map();
  const unresolvedTargets = [];

  for (const target of requestedTargets) {
    if (available.has(target)) continue;
    const producer = findProducer(target, allowed);
    if (!producer) {
      unresolvedTargets.push(target);
      continue;
    }
    selectWithDependencies(producer, selected, available, allowed, new Set());
  }

  const ordered = topologicalOrder(Array.from(selected.values()), available);
  const produced = new Set(available);
  ordered.forEach(item => item.produces.forEach(output => produced.add(output)));

  return {
    version: 'algorithm-execution-plan-v1',
    valid: unresolvedTargets.length === 0 && ordered.every(item => item.missing.length === 0),
    requestedTargets,
    unresolvedTargets,
    availableOutputs: Array.from(produced).sort(),
    steps: ordered.map((item, index) => ({
      order: index + 1,
      id: item.id,
      label: item.label,
      version: item.version,
      stage: item.stage,
      status: item.status,
      requires: [...item.requires],
      produces: [...item.produces],
      missing: [...item.missing]
    }))
  };
}

export async function executeAlgorithmPlan(plan, context = {}, options = {}) {
  if (!plan?.steps?.length) {
    return {
      version: 'algorithm-execution-result-v1',
      success: Boolean(plan?.valid),
      outputs: { ...(context.outputs || {}) },
      steps: [],
      errors: plan?.unresolvedTargets?.map(target => ({ target, message: 'Aucun producteur disponible.' })) || []
    };
  }

  const outputs = { ...(context.outputs || {}) };
  const stepResults = [];
  const errors = [];

  for (const step of plan.steps) {
    const algorithm = getAlgorithm(step.id);
    if (!algorithm) {
      errors.push({ id: step.id, message: 'Algorithme absent du registre.' });
      if (options.stopOnError) break;
      continue;
    }

    const missing = algorithm.requires.filter(requirement => !(requirement in outputs));
    if (missing.length) {
      const error = { id: algorithm.id, message: 'Dépendances manquantes.', missing };
      errors.push(error);
      stepResults.push({ id: algorithm.id, status: 'skipped', missing });
      if (options.stopOnError) break;
      continue;
    }

    if (typeof algorithm.compute !== 'function') {
      const error = { id: algorithm.id, message: 'Fonction compute indisponible.' };
      errors.push(error);
      stepResults.push({ id: algorithm.id, status: 'non-executable' });
      if (options.stopOnError) break;
      continue;
    }

    try {
      const input = Object.fromEntries(algorithm.requires.map(key => [key, outputs[key]]));
      const result = await measureAlgorithm(
        algorithm.id,
        () => algorithm.compute({ input, outputs, context, options }),
        {
          swallowErrors: false,
          score: options.scoreByAlgorithm?.[algorithm.id]
        }
      );

      assignOutputs(outputs, algorithm.produces, result);
      stepResults.push({
        id: algorithm.id,
        status: 'completed',
        produced: [...algorithm.produces]
      });
    } catch (error) {
      errors.push({ id: algorithm.id, message: String(error?.message || error) });
      stepResults.push({ id: algorithm.id, status: 'error' });
      if (options.stopOnError) break;
    }
  }

  return {
    version: 'algorithm-execution-result-v1',
    success: errors.length === 0,
    outputs,
    steps: stepResults,
    errors
  };
}

export async function runRegisteredAlgorithms({
  targets = [],
  availableOutputs = [],
  outputs = {},
  context = {},
  allowedStatuses,
  stopOnError = false,
  scoreByAlgorithm = {}
} = {}) {
  const initialOutputs = { ...outputs };
  const initialAvailable = uniqueStrings([
    ...availableOutputs,
    ...Object.keys(initialOutputs)
  ]);

  const plan = buildExecutionPlan({ targets, availableOutputs: initialAvailable, allowedStatuses });
  const result = await executeAlgorithmPlan(plan, { ...context, outputs: initialOutputs }, {
    stopOnError,
    scoreByAlgorithm
  });
  return { plan, result };
}

function selectWithDependencies(algorithm, selected, available, allowed, visiting) {
  if (selected.has(algorithm.id)) return;
  if (visiting.has(algorithm.id)) throw new Error(`Cycle détecté autour de ${algorithm.id}.`);

  visiting.add(algorithm.id);
  for (const requirement of algorithm.requires) {
    if (available.has(requirement)) continue;
    const producer = findProducer(requirement, allowed);
    if (producer) selectWithDependencies(producer, selected, available, allowed, visiting);
  }
  visiting.delete(algorithm.id);
  selected.set(algorithm.id, algorithm);
  algorithm.produces.forEach(output => available.add(output));
}

function topologicalOrder(algorithms, initialAvailable) {
  const remaining = new Map(algorithms.map(item => [item.id, item]));
  const available = new Set(initialAvailable);
  const ordered = [];

  while (remaining.size) {
    const ready = Array.from(remaining.values())
      .filter(item => item.requires.every(requirement => available.has(requirement)))
      .sort((a, b) => stageRank(a.stage) - stageRank(b.stage) || a.id.localeCompare(b.id));

    if (!ready.length) {
      for (const item of Array.from(remaining.values()).sort((a, b) => a.id.localeCompare(b.id))) {
        ordered.push({
          ...item,
          missing: item.requires.filter(requirement => !available.has(requirement))
        });
        remaining.delete(item.id);
      }
      break;
    }

    for (const item of ready) {
      ordered.push({ ...item, missing: [] });
      item.produces.forEach(output => available.add(output));
      remaining.delete(item.id);
    }
  }

  return ordered;
}

function findProducer(output, allowedStatuses) {
  return listAlgorithms()
    .filter(item => allowedStatuses.has(item.status))
    .filter(item => item.produces.includes(output))
    .sort((a, b) => statusRank(a.status) - statusRank(b.status) || stageRank(a.stage) - stageRank(b.stage) || a.id.localeCompare(b.id))[0] || null;
}

function assignOutputs(outputs, producedKeys, result) {
  if (!producedKeys.length) return;
  if (producedKeys.length === 1) {
    outputs[producedKeys[0]] = result;
    return;
  }

  if (result && typeof result === 'object') {
    for (const key of producedKeys) outputs[key] = result[key];
    return;
  }

  throw new Error('Un résultat objet est requis pour plusieurs sorties.');
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(value => String(value).trim()).filter(Boolean))];
}

function statusRank(status) {
  return status === 'validated' ? 0 : status === 'experimental' ? 1 : 2;
}

function stageRank(stage) {
  return {
    preprocessing: 0,
    segmentation: 1,
    geometry: 2,
    topology: 3,
    descriptor: 4,
    matching: 5,
    fusion: 6,
    postprocessing: 7
  }[stage] ?? 99;
}
