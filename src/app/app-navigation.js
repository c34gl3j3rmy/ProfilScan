export function createNavigation({ state, dom, onLeaveCamera, onLeaveResult }) {
  function show(name, options = {}) {
    const { replace = false, history: useHistory = true } = options;

    Object.values(dom.screens).forEach(screen => screen?.classList.add('hidden'));
    dom.screens[name]?.classList.remove('hidden');
    state.currentScreen = name;

    if (useHistory && !state.restoringHistory) updateHistory(name, replace);
  }

  function updateHistory(screen, replace) {
    const nextState = { profilScanScreen: screen };

    if (replace || !history.state?.profilScanScreen) {
      history.replaceState(nextState, '', window.location.pathname);
    } else {
      history.pushState(nextState, '', window.location.pathname);
    }
  }

  function goBackSafe() {
    if (
      state.currentScreen
      && state.currentScreen !== 'home'
      && state.currentScreen !== 'noBase'
    ) {
      history.back();
    } else {
      show('home', { replace: true });
    }
  }

  function bindHistory() {
    window.addEventListener('popstate', event => {
      const target = event.state?.profilScanScreen
        || (state.collection ? 'home' : 'noBase');

      state.restoringHistory = true;

      if (state.currentScreen === 'camera' && target !== 'camera') {
        onLeaveCamera?.();
      }
      if (state.currentScreen === 'result' && target !== 'result') {
        onLeaveResult?.();
      }

      show(target, { history: false });
      state.restoringHistory = false;
    });
  }

  return { show, goBackSafe, bindHistory };
}
