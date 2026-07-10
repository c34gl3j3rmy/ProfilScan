import { getCollection, saveCollection } from '../storage/indexed-db.js';
import {
  compareSettingsPackages,
  createSettingsPackage,
  promotePackageToCandidate,
  sanitizeImportedPackage,
  stableStringifySettingsPackage
} from '../config/settings-package.js';

const STORAGE_KEY = 'profilscan-settings-package';
const OFFICIAL_URL = './configs/validated-default.json';

const openButton = document.querySelector('#configManagerButton');
const closeButton = document.querySelector('#closeConfigManagerButton');
const exportButton = document.querySelector('#exportConfigButton');
const exportCandidateButton = document.querySelector('#exportCandidateConfigButton');
const importInput = document.querySelector('#importConfigInput');
const restoreButton = document.querySelector('#restoreOfficialConfigButton');
const applyButton = document.querySelector('#applyLocalConfigButton');
const screen = document.querySelector('#screenConfigManager');
const status = document.querySelector('#configManagerStatus');
const officialSummary = document.querySelector('#officialConfigSummary');
const localSummary = document.querySelector('#localConfigSummary');
const diffOutput = document.querySelector('#configDiffOutput');

let officialPackage = null;
let localPackage = null;
let collection = null;

openButton?.addEventListener('click', openManager);
closeButton?.addEventListener('click', closeManager);
exportButton?.addEventListener('click', () => exportPackage(localPackage, 'local-experimental'));
exportCandidateButton?.addEventListener('click', exportCandidate);
importInput?.addEventListener('change', importPackageFile);
restoreButton?.addEventListener('click', restoreOfficial);
applyButton?.addEventListener('click', applyLocalPackage);

async function openManager() {
  try {
    hideScreens();
    screen?.classList.remove('hidden');
    setStatus('Chargement des configurations...');

    [officialPackage, collection] = await Promise.all([
      fetchOfficialPackage(),
      getCollection()
    ]);

    localPackage = loadLocalPackage() || buildPackageFromCurrentApp();
    saveLocalPackage(localPackage);
    render();
    setStatus('Configurations prêtes.');
  } catch (error) {
    setStatus(`Erreur : ${error.message || error}`, true);
  }
}

function closeManager() {
  hideScreens();
  document.querySelector('#screenHome')?.classList.remove('hidden');
}

async function fetchOfficialPackage() {
  const response = await fetch(OFFICIAL_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Configuration officielle indisponible (${response.status}).`);
  return response.json();
}

function buildPackageFromCurrentApp() {
  const pipeline = collection?.pipelineSettings || officialPackage?.settings?.pipeline || {};
  const weights = readWeightInputs();
  return createSettingsPackage({
    name: 'local-experimental',
    description: 'Paramètres actuellement utilisés sur cet appareil.',
    status: 'local-experimental',
    datasetVersion: officialPackage?.datasetVersion || null,
    baseFingerprint: collection?.metadata?.baseFingerprint || null,
    pipeline,
    weights: Object.keys(weights).length ? weights : officialPackage?.settings?.weights,
    modules: officialPackage?.settings?.modules,
    thresholds: readThresholdInputs(),
    source: { kind: 'pwa-local', label: navigator.userAgent }
  });
}

function loadLocalPackage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const result = sanitizeImportedPackage(parsed, {
      datasetVersion: officialPackage?.datasetVersion,
      baseFingerprint: collection?.metadata?.baseFingerprint
    });
    return result.package;
  } catch {
    return null;
  }
}

function saveLocalPackage(value) {
  if (!value) return;
  localStorage.setItem(STORAGE_KEY, stableStringifySettingsPackage(value, 0));
}

async function importPackageFile(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;

  try {
    const parsed = JSON.parse(await file.text());
    const result = sanitizeImportedPackage(parsed, {
      datasetVersion: officialPackage?.datasetVersion,
      baseFingerprint: collection?.metadata?.baseFingerprint
    });
    if (!result.valid || !result.package) {
      throw new Error(`Paquet invalide : ${result.errors.join(', ')}`);
    }

    localPackage = result.package;
    saveLocalPackage(localPackage);
    render();
    const warningText = result.warnings.length ? ` Avertissements : ${result.warnings.join(', ')}.` : '';
    setStatus(`Configuration importée comme ${localPackage.status}.${warningText}`);
  } catch (error) {
    setStatus(`Import impossible : ${error.message || error}`, true);
  }
}

async function applyLocalPackage() {
  if (!localPackage) return;
  try {
    collection = collection || await getCollection();
    if (collection) {
      collection.pipelineSettings = { ...localPackage.settings.pipeline };
      collection.settingsPackage = localPackage;
      await saveCollection(collection);
    }
    applyInputs(localPackage);
    setStatus('Configuration locale appliquée. Recharge la page si un écran conserve encore les anciennes valeurs.');
  } catch (error) {
    setStatus(`Application impossible : ${error.message || error}`, true);
  }
}

async function restoreOfficial() {
  if (!officialPackage) return;
  localPackage = createSettingsPackage({
    name: 'local-experimental',
    description: 'Copie locale restaurée depuis la configuration officielle.',
    status: 'local-experimental',
    datasetVersion: officialPackage.datasetVersion,
    baseFingerprint: officialPackage.baseFingerprint,
    pipeline: officialPackage.settings?.pipeline,
    weights: officialPackage.settings?.weights,
    modules: officialPackage.settings?.modules,
    thresholds: officialPackage.settings?.thresholds,
    source: { kind: 'repository-default', label: 'configs/validated-default.json' }
  });
  saveLocalPackage(localPackage);
  await applyLocalPackage();
  render();
  setStatus('Paramètres officiels restaurés sur cet appareil.');
}

function exportCandidate() {
  if (!localPackage) return;
  const candidate = promotePackageToCandidate(localPackage, {
    status: 'pending-review',
    baseline: officialPackage?.benchmark || null,
    candidate: localPackage.benchmark || null,
    notes: 'À valider avec le golden benchmark avant publication.'
  });
  exportPackage(candidate, candidate.name || 'candidate');
}

function exportPackage(value, fallbackName) {
  if (!value) {
    setStatus('Aucune configuration à exporter.', true);
    return;
  }
  const fileName = `profilscan-${safeName(value.name || fallbackName)}-${new Date().toISOString().slice(0, 10)}.json`;
  const blob = new Blob([stableStringifySettingsPackage(value)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setStatus(`Fichier exporté : ${fileName}`);
}

function render() {
  renderSummary(officialSummary, officialPackage, 'Officielle');
  renderSummary(localSummary, localPackage, 'Locale');

  if (!diffOutput || !officialPackage || !localPackage) return;
  const diff = compareSettingsPackages(officialPackage, localPackage);
  const changed = [
    ...diff.pipeline.map(item => ({ section: 'Pipeline', ...item })),
    ...diff.weights.map(item => ({ section: 'Poids', ...item })),
    ...diff.modules.map(item => ({ section: 'Modules', ...item })),
    ...diff.thresholds.map(item => ({ section: 'Seuils', ...item }))
  ].filter(item => item.changed);

  diffOutput.innerHTML = changed.length
    ? `<table class="config-diff-table"><thead><tr><th>Section</th><th>Paramètre</th><th>Officiel</th><th>Local</th></tr></thead><tbody>${changed.map(item => `<tr><td>${escapeHtml(item.section)}</td><th>${escapeHtml(item.key)}</th><td>${escapeHtml(formatValue(item.left))}</td><td>${escapeHtml(formatValue(item.right))}</td></tr>`).join('')}</tbody></table>`
    : '<p class="config-equal">La configuration locale est identique à la configuration officielle.</p>';
}

function renderSummary(target, value, label) {
  if (!target) return;
  if (!value) {
    target.innerHTML = '<p>Indisponible</p>';
    return;
  }
  const benchmark = value.benchmark || {};
  target.innerHTML = `
    <span class="config-badge ${escapeHtml(value.status)}">${escapeHtml(value.status)}</span>
    <h3>${escapeHtml(label)} — ${escapeHtml(value.name || '-')}</h3>
    <p>${escapeHtml(value.description || '')}</p>
    <dl>
      <div><dt>Moteur</dt><dd>${escapeHtml(value.engineVersion || '-')}</dd></div>
      <div><dt>Dataset</dt><dd>${escapeHtml(value.datasetVersion || '-')}</dd></div>
      <div><dt>Top 1</dt><dd>${formatMetric(benchmark.top1)}</dd></div>
      <div><dt>Top 3</dt><dd>${formatMetric(benchmark.top3)}</dd></div>
      <div><dt>Générée</dt><dd>${escapeHtml(formatDate(value.generatedAt))}</dd></div>
    </dl>`;
}

function applyInputs(value) {
  const pipelineMap = {
    fillGridSize: 'pipelineFillGridInput',
    contourPointCount: 'pipelineContourPointInput',
    simplifyEpsilon: 'pipelineSimplifyInput'
  };
  Object.entries(pipelineMap).forEach(([key, id]) => {
    const input = document.getElementById(id);
    if (!input) return;
    const raw = value.settings?.pipeline?.[key];
    input.value = key === 'simplifyEpsilon' ? Math.round(Number(raw) * 1000) : raw;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

  const weightMap = {
    ratio: 'weightRatioInput', radial: 'weightRadialInput', hu: 'weightHuInput',
    fourier: 'weightFourierInput', angle: 'weightAngleInput', fill: 'weightFillInput'
  };
  Object.entries(weightMap).forEach(([key, id]) => {
    const input = document.getElementById(id);
    if (!input || value.settings?.weights?.[key] == null) return;
    input.value = value.settings.weights[key];
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function readWeightInputs() {
  return readInputs({
    ratio: 'weightRatioInput', radial: 'weightRadialInput', hu: 'weightHuInput',
    fourier: 'weightFourierInput', angle: 'weightAngleInput', fill: 'weightFillInput'
  });
}

function readThresholdInputs() {
  return readInputs({
    brightness: 'brightnessInput', contrast: 'contrastInput', blurRadius: 'blurRadiusInput',
    textureSuppression: 'textureSuppressionInput', edgeQuantile: 'edgeQuantileInput',
    linkRadius: 'linkRadiusInput', minArea: 'minAreaInput', mergeGap: 'mergeGapInput'
  });
}

function readInputs(mapping) {
  return Object.fromEntries(Object.entries(mapping).flatMap(([key, id]) => {
    const input = document.getElementById(id);
    const value = Number(input?.value);
    return Number.isFinite(value) ? [[key, value]] : [];
  }));
}

function hideScreens() {
  document.querySelectorAll('.app-shell > section').forEach(section => section.classList.add('hidden'));
}

function setStatus(message, isError = false) {
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('error', isError);
}

function formatMetric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.round(number * 100) / 100} %` : '-';
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('fr-FR');
}

function formatValue(value) {
  return typeof value === 'object' ? JSON.stringify(value) : String(value ?? '-');
}

function safeName(value) {
  return String(value || 'configuration').replace(/[^a-z0-9_-]+/gi, '-');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
}
