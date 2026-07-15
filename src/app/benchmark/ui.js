export function createBenchmarkUi({ baseStatus, analysisStatus, analysisProgress, analysisPercent, analysisDetails }) {
  return {
    showAnalysisScreen() {
      document.querySelectorAll('.app-shell > section').forEach(section => section.classList.add('hidden'));
      document.querySelector('#screenAnalysis')?.classList.remove('hidden');
    },

    resetProgress(label) {
      if (analysisProgress) analysisProgress