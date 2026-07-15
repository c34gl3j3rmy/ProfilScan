export function showAnalysisScreen() {
  document.querySelectorAll('.app-shell > section').forEach(section => section.classList.add('hidden'));
  document.querySelector('#screenAnalysis')?.classList.remove('hidden');
}

export function resetProgress(label) {
  if (analysisProgress) analysisProgress.value = 0;
  if (analysisPercent) analysisPercent.textContent = '0 %';
  if (analysisStatus) analysisStatus.textContent = label;
  if (analysisDetails) analysisDetails.innerHTML = '';
}

export function setProgress(percent, label, detail, className = '') {
  const safePercent = Math.max(0, Math.min(100, Math.round(percent)));
  if (analysisProgress) analysisProgress.value = safePercent;
  if (analysisPercent) analysisPercent.textContent = `${safePercent} %`;
  if (analysisStatus) analysisStatus.textContent = label;
  if (!analysisDetails || !detail) return;

  const item = document.createElement('li');
  item.textContent = detail;
  if (className) item.classList.add(className);
  analysisDetails.appendChild(item);
  analysisDetails.scrollTop = analysisDetails.scrollHeight;
}

export function setBenchmarkStatus(message) {
  if (baseStatus) baseStatus.textContent = message;
}
