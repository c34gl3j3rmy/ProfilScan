import { importDataprofilsText } from '../import/dataprofils-importer.js';

self.onmessage = async event => {
  if (event.data?.type !== 'import-dataprofils') return;

  try {
    const collection = await importDataprofilsText(event.data.text, progress => {
      self.postMessage({ type: 'progress', ...progress });
    });

    self.postMessage({ type: 'done', collection });
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error)
    });
  }
};
