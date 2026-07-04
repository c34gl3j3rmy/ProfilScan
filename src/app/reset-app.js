export function bindResetAppButton(buttonSelector = '#resetAppButton') {
  const button = document.querySelector(buttonSelector);
  if (!button) return;
  button.addEventListener('click', resetProfilScan);
}

async function resetProfilScan() {
  const confirmed = window.confirm('Reinitialiser ProfilScan ?\n\nCela supprimera la base locale, les signatures calculees, les caches et le service worker. Il faudra ensuite reimporter dataprofils.js.');
  if (!confirmed) return;

  await deleteIndexedDb('ProfilScanDB');
  await deleteAllCaches();
  await unregisterServiceWorkers();
  window.location.href = window.location.pathname;
}

function deleteIndexedDb(name) {
  if (!window.indexedDB) return Promise.resolve();

  return new Promise(resolve => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

async function deleteAllCaches() {
  if (!window.caches) return;
  const keys = await caches.keys();
  await Promise.all(keys.map(key => caches.delete(key)));
}

async function unregisterServiceWorkers() {
  if (!navigator.serviceWorker) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map(registration => registration.unregister()));
}

bindResetAppButton();
