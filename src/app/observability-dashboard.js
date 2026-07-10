import '../observability/core-algorithm-runtime.js';
import { getAlgorithmRegistrySnapshot } from '../observability/algorithm-registry.js';
import {
  buildAlgorithmTelemetryReport,
  listAlgorithmTelemetry,
  resetAlgorithmTelemetry
} from '../observability/algorithm-telemetry.js';

const homeScreen = document.querySelector('#screenHome');
const appShell = document.querySelector('.app-shell');

let screen = null;
let statusNode = null;
let summaryNode = null;
let registryNode = null;
let telemetryNode = null;

initialize();

function initialize() {
  if (!homeScreen || !appShell || document.querySelector('#observabilityButton')) return;

  const button = document.createElement('button');
  button.id = 'observabilityButton';
  button.className = 'button ghost';
  button.innerHTML = 'Observabilite du moteur<br><small>Registre, performances et coherence</small>';
  button.addEventListener('click', openDashboard);
  homeScreen.appendChild(button);

  screen = document.createElement('section');
  screen.id = 'screenObservability';
  screen.className = 'card hidden';
  screen.innerHTML = `
    <h2>Observabilite du moteur</h2>
    <p class="hint">Toutes les mesures restent sur cet appareil. Les analyses executees dans un worker peuvent fournir leurs propres rapports dans les exports de benchmark.</p>
    <p id="observabilityStatus" class="config-manager-status">Pret.</p>
    <div id="observabilitySummary" class="debug-summary-grid"></div>

    <h3>Registre des algorithmes</h3>
    <div id="observabilityRegistry" class="config-diff-output"></div>

    <h3>Telemetrie de cette session</h3>
    <div id="observabilityTelemetry" class="config-diff-output"></div>

    <div class="config-actions">
      <button id="refreshObservabilityButton" class="button secondary compact-button">Actualiser</button>
      <button id="exportObservabilityButton" class="button secondary compact-button">Exporter JSON</button>
      <button id="resetObservabilityButton" class="button ghost compact-button">Reinitialiser les mesures</button>
      <button id="closeObservabilityButton" class="button primary compact-button">Retour</button>
    </div>`;
  appShell.appendChild(screen);

  statusNode = screen.querySelector('#observabilityStatus');
  summaryNode = screen.querySelector('#observabilitySummary');
  registryNode = screen.querySelector('#observabilityRegistry');
  telemetryNode = screen.querySelector('#observabilityTelemetry');

  screen.querySelector('#refreshObservabilityButton')?.addEventListener('click', renderDashboard);
  screen.querySelector('#exportObservabilityButton')?.addEventListener('click', exportReport);
  screen.querySelector('#resetObservabilityButton')?.addEventListener('click', resetMeasurements);
  screen.querySelector('#closeObservabilityButton')?.addEventListener('click', closeDashboard);
}

function openDashboard() {
  document.querySelectorAll('.app-shell > section').forEach(section => section.classList.add('hidden'));
  screen?.classList.remove('hidden');
  renderDashboard();
}

function closeDashboard() {
  document.querySelectorAll('.app-shell > section').forEach(section => section.classList.add('hidden'));
  homeScreen?.classList.remove('hidden');
}

function renderDashboard() {
  const registry = getAlgorithmRegistrySnapshot();
  const telemetry = listAlgorithmTelemetry();
  const executable = registry.algorithms.filter(item => item.executable).length;
  const experimental = registry.algorithms.filter(item => item.status === 'experimental').length;
  const errors = telemetry.reduce((sum, item) => sum + item.errors, 0);
  const consistency = telemetry.filter(item => item.id.startsWith('consistency.'));
  const divergences = consistency.filter(item => item.decisions?.degraded > 0).length;

  summaryNode.innerHTML = [
    summaryCard('Algorithmes', registry.algorithms.length, `${executable} executables`),
    summaryCard('Experimentaux', experimental, 'A valider par benchmark'),
    summaryCard('Appels mesures', telemetry.reduce((sum, item) => sum + item.calls, 0), `${errors} erreurs`),
    summaryCard('Coherence', consistency.length, `${divergences} divergences`)
  ].join('');

  registryNode.innerHTML = registry.algorithms.length
    ? `<table class="config-diff-table"><thead><tr><th>Algorithme</th><th>Version</th><th>Etape</th><th>Statut</th><th>Runtime</th></tr></thead><tbody>${registry.algorithms.map(item => `
      <tr>
        <th>${escapeHtml(item.label)}</th>
        <td>${escapeHtml(item.version)}</td>
        <td>${escapeHtml(item.stage)}</td>
        <td><span class="config-badge ${escapeHtml(statusClass(item.status))}">${escapeHtml(item.status)}</span></td>
        <td>${item.executable ? 'Oui' : 'Non'}</td>
      </tr>`).join('')}</tbody></table>`
    : '<p class="debug-empty">Aucun algorithme enregistre.</p>';

  telemetryNode.innerHTML = telemetry.length
    ? `<table class="config-diff-table"><thead><tr><th>Mesure</th><th>Appels</th><th>Moyenne</th><th>P95</th><th>Erreurs</th><th>Recommandation</th></tr></thead><tbody>${telemetry.map(item => `
      <tr>
        <th>${escapeHtml(item.id)}</th>
        <td>${item.calls}</td>
        <td>${formatMs(item.timing?.meanMs)}</td>
        <td>${formatMs(item.timing?.p95Ms)}</td>
        <td>${item.errors}</td>
        <td>${escapeHtml(item.decisions?.recommendation || '-')}</td>
      </tr>`).join('')}</tbody></table>`
    : '<p class="debug-empty">Aucune mesure dans le contexte principal pour cette session. Lance une analyse ou un benchmark, puis actualise.</p>';

  setStatus(`Actualise a ${new Date().toLocaleTimeString('fr-FR')}.`);
}

function exportReport() {
  const report = {
    type: 'ProfilScan observability dashboard export',
    version: 'observability-dashboard-v1',
    generatedAt: new Date().toISOString(),
    registry: getAlgorithmRegistrySnapshot(),
    telemetry: buildAlgorithmTelemetryReport({ source: 'pwa-main-thread' })
  };
  const fileName = `profilscan-observability-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`;
  const blob = new Blob([JSON.stringify(report, null, 2) + '\n'], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setStatus(`Rapport exporte : ${fileName}`);
}

function resetMeasurements() {
  resetAlgorithmTelemetry();
  renderDashboard();
  setStatus('Mesures de cette session reinitialisees.');
}

function summaryCard(label, value, detail) {
  return `<article class="debug-summary-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small></article>`;
}

function statusClass(status) {
  if (status === 'validated') return 'validated-default';
  if (status === 'experimental') return 'local-experimental';
  if (status === 'disabled') return 'candidate';
  return '';
}

function formatMs(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.round(number * 1000) / 1000} ms` : '-';
}

function setStatus(message) {
  if (statusNode) statusNode.textContent = message;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
}
