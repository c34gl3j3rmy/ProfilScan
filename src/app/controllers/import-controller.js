import { saveCollection } from '../../storage/indexed-db.js';
import { normalizePipelineSettings } from '../../shape-engine/pipeline-settings.js';
import { createWorkerClient } from '../shared/worker-client.js';

export function createImportController({
  state,
  dom,
  navigation,
  progress,
  applyPipelineSettingsToInputs,
  refreshProfileList
}) {
  const client = createWorkerClient(
    new URL('../../workers/import-worker.js', import.meta.url)
  );

  async function importBaseFromFile(file) {
    if (!file) return;

    navigation.show('analysis');
    progress.reset('Import de la base profils');

    try {
      progress.set(5, 'Lecture du fichier', `Fichier : ${file.name}`);
      const text = await file.text();

      state.collection = await client.run(
        {
          type: 'import-dataprofils',
          text,
          pipelineSettings: state.currentPipelineSettings
        },
        message => progress.set(message.percent, message.label, message.detail)
      );

      state.currentPipelineSettings = normalizePipelineSettings(
        state.collection.pipelineSettings || state.currentPipelineSettings
      );

      applyPipelineSettingsToInputs(state.currentPipelineSettings, false);
      progress.set(92, 'Enregistrement local', 'Stockage IndexedDB');
      await saveCollection(state.collection);

      refreshProfileList();
      progress.set(
        100,
        'Import termine',
        `${state.collection.profiles.length} profils valides`,
        'done'
      );

      dom.baseStatus.textContent =
        `Base chargee : ${state.collection.profiles.length} profils`;

      setTimeout(() => navigation.show('home', { replace: true }), 500);
    } catch (error) {
      progress.showError(error);
    }
  }

  return { importBaseFromFile };
}
