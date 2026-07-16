import { formatError } from './common-utils.js';

export function createWorkerClient(url) {
  let worker = null;

  function getWorker() {
    if (!worker) worker = new Worker(url, { type: 'module' });
    return worker;
  }

  function run(payload, onProgress) {
    return new Promise((resolve, reject) => {
      const activeWorker = getWorker();
      activeWorker.onmessage = event => {
        const message = event.data;
        if (message?.type === 'progress') {
          onProgress?.(message);
          return;
        }
        if (message?.type === 'error') reject(new Error(message.message || 'Erreur worker'));
        else if (message?.type === 'done') resolve(message.collection);
        else resolve(message);
      };
      activeWorker.onerror = event => reject(new Error(formatError(event)));
      activeWorker.postMessage(payload);
    });
  }

  return { getWorker, run };
}
