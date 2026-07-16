import './reset-app.js';
import './live-slider-preview.js';
import { bootApplication } from './app-bootstrap.js';
import { formatError } from './shared/common-utils.js';

bootApplication().catch(error => {
  console.error('ProfilScan boot failure', error);

  const status = document.querySelector('#baseStatus');
  if (status) status.textContent = `Erreur : ${formatError(error)}`;

  const noBaseScreen = document.querySelector('#screenNoBase');
  noBaseScreen?.classList.remove('hidden');
});
