// src/utils/routerMode.ts
// Helpers for determining router mode (browser vs hash) based on runtime environment

const detectHashRouting = (): boolean => {
  if (typeof window === 'undefined') return false;

  // Explicit opt-in via environment variable
  if (import.meta.env.VITE_FORCE_HASH_ROUTER === 'true') {
    return true;
  }

  const protocol = window.location.protocol;
  const isFileProtocol = protocol === 'file:';
  const isTauri = Boolean((window as unknown as { __TAURI_IPC__?: unknown }).__TAURI_IPC__);

  // Use hash routing when running from file:// or inside a Tauri WebView (production build)
  return isFileProtocol || isTauri;
};

export const isHashRoutingEnabled = detectHashRouting();

/**
 * Get the current application path regardless of router mode.
 */
export const getCurrentAppPath = (): string => {
  if (typeof window === 'undefined') return '/';

  if (isHashRoutingEnabled) {
    const hash = window.location.hash || '';
    if (!hash || hash === '#') return '/';
    return hash.startsWith('#') ? hash.slice(1) : hash;
  }

  return window.location.pathname || '/';
};

/**
 * Update browser history or hash based on router mode.
 */
export const updateAppHistory = (path: string) => {
  if (typeof window === 'undefined') return;

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  if (isHashRoutingEnabled) {
    const targetHash = `#${normalizedPath}`;
    if (window.location.hash !== targetHash) {
      window.location.hash = normalizedPath;
    } else {
      // Force hashchange so HashRouter notices identical updates
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    }
  } else {
    window.history.pushState(null, '', normalizedPath);
    // Dispatch popstate event to trigger React Router's useLocation update
    // pushState alone doesn't trigger this event, which causes useLocation to be out of sync
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
  }
};
