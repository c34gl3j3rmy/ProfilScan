const reportButton = document.querySelector('#copyAnalysisReportButton');

reportButton?.addEventListener('click', prepareReportDownload, true);

function prepareReportDownload() {
  const clipboard = navigator.clipboard;
  const originalWriteText = clipboard?.writeText?.bind(clipboard);
  if (!clipboard || !originalWriteText) return;

  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    try {
      clipboard.writeText = originalWriteText;
    } catch {
      // Certains navigateurs verrouillent navigator.clipboard.
    }
  };

  try {
    clipboard.writeText = async text => {
      downloadJsonText(text, 'profilscan-analyse-' + timestampForFile() + '.json');
      setButtonState('Rapport telecharge');
      restore();
      return Promise.resolve();
    };
  } catch {
    return;
  }

  setTimeout(restore, 1500);
}

function downloadJsonText(text, fileName) {
  const blob = new Blob([text], { type: 'application/json' });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

function setButtonState(text) {
  if (!reportButton) return;
  reportButton.textContent = text;
  setTimeout(() => { reportButton.textContent = 'Telecharger rapport'; }, 1400);
}

function timestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}
