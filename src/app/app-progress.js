import { formatError } from './shared/common-utils.js';

export function createProgress({ dom, navigation }) {
  function reset(label = 'Preparation') {
    if (dom.analysisProgress) dom.analysisProgress.value = 0;
    if (dom.analysisPercent) dom.analysisPercent.textContent = '0 %';
    if (dom.analysisStatus) dom.analysisStatus.textContent = label;
    if (dom.analysisDetails) dom.analysisDetails.innerHTML = '';
  }

  function set(percent, label, detail, className = '') {
    const safePercent = Math.max(0, Math.min(100, Math.round(percent)));

    if (dom.analysisProgress) dom.analysisProgress.value = safePercent;
    if (dom.analysisPercent) dom.analysisPercent.textContent = `${safePercent} %`;
    if (dom.analysisStatus) dom.analysisStatus.textContent = label;
    if (!detail || !dom.analysisDetails) return;

    const item = document.createElement('li');
    item.textContent = detail;
    if (className) item.classList.add(className);
    dom.analysisDetails.appendChild(item);
    dom.analysisDetails.scrollTop = dom.analysisDetails.scrollHeight;
  }

  function showError(error, fallbackScreen = 'noBase') {
    const message = formatError(error);
    set(100, 'Erreur', message, 'error');
    if (dom.baseStatus) dom.baseStatus.textContent = `Erreur : ${message}`;
    setTimeout(() => navigation.show(fallbackScreen), 2200);
  }

  return { reset, set, showError };
}
