import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './index.css';

// ─────────────────────────────────────────────────────────────────
// Clear stale location-based weather cache BEFORE React mounts.
// This is the safest place — main.tsx runs once, before any
// React component or router is initialized.
// Fixes: Taytay weather appearing because old cached weather
// from a different location was being restored from localStorage.
// ─────────────────────────────────────────────────────────────────
try {
  const raw = localStorage.getItem('skycheck-query-cache');
  if (raw) {
    const parsed = JSON.parse(raw) as {
      clientState?: { queries?: Array<{ queryKey: unknown[] }> };
    };
    if (parsed?.clientState?.queries) {
      const VOLATILE = new Set(['go-no-go']);
      const before = parsed.clientState.queries.length;
      parsed.clientState.queries = parsed.clientState.queries.filter(
        (q) => !Array.isArray(q.queryKey) || !VOLATILE.has(q.queryKey[0] as string)
      );
      if (parsed.clientState.queries.length !== before) {
        localStorage.setItem('skycheck-query-cache', JSON.stringify(parsed));
        console.info('[SkyCheck] Cleared volatile decision cache');
      }
    }
  }
} catch {
  localStorage.removeItem('skycheck-query-cache');
}

const rootEl = document.getElementById('root');

registerSW({ immediate: true });

ReactDOM.createRoot(rootEl!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
