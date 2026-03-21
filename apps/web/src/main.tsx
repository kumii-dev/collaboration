import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import 'bootstrap/dist/css/bootstrap.min.css';
import './styles/main.css';
// Import messageBuffer FIRST — installs the early message listener before
// React mounts, so no KUMII_SESSION is ever dropped due to a mount race.
import './lib/messageBuffer';

const isIframe = (() => { try { return window.self !== window.top; } catch { return true; } })();

// ── Iframe link + download bridge ──────────────────────────────────────────
// When running inside an iframe, browsers may block window.open() and file
// downloads. We intercept every click on <a target="_blank"> and every
// programmatic window.open() call, and ask the parent frame to open the URL
// instead via postMessage({ type: 'KUMII_OPEN_URL', url }).
if (isIframe) {
  // 1. Intercept anchor clicks
  document.addEventListener('click', (e) => {
    const anchor = (e.target as HTMLElement).closest('a');
    if (!anchor) return;
    const href = anchor.getAttribute('href');
    const target = anchor.getAttribute('target');
    if (!href || href.startsWith('#') || href.startsWith('/')) return;
    // External URL or explicit _blank — let parent handle it
    if (target === '_blank' || href.startsWith('http')) {
      e.preventDefault();
      window.parent.postMessage({ type: 'KUMII_OPEN_URL', url: href }, '*');
    }
  }, true); // capture phase so it fires before React's synthetic events

  // 2. Intercept programmatic window.open()
  const _nativeOpen = window.open.bind(window);
  window.open = (url?: string | URL, target?: string, features?: string) => {
    if (url) {
      const urlStr = url.toString();
      // Only intercept external URLs opened in a new tab
      if (urlStr.startsWith('http') && (target === '_blank' || target === undefined)) {
        window.parent.postMessage({ type: 'KUMII_OPEN_URL', url: urlStr }, '*');
        return null;
      }
    }
    return _nativeOpen(url, target, features);
  };
}

// Mount React exactly once — guard against HMR / module re-evaluation calling
// createRoot on an already-rooted container, which produces the React warning.
const rootEl = document.getElementById('root')!;
type RootEl = HTMLElement & { __reactRoot?: ReturnType<typeof ReactDOM.createRoot> };
if (!(rootEl as RootEl).__reactRoot) {
  (rootEl as RootEl).__reactRoot = ReactDOM.createRoot(rootEl);
}
(rootEl as RootEl).__reactRoot!.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
