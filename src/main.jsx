import React from 'react';
import { createRoot } from 'react-dom/client';
import { invoke } from '@tauri-apps/api/core';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './styles.css';

const root = createRoot(document.getElementById('root'));

// Electron never shows a native context menu unless you build one yourself; WebView2 does, by
// default, everywhere (Refresh/Print/Inspect and so on) — this is that difference. Left on for
// text fields (so right-click paste still works there), suppressed everywhere else so it
// doesn't cover Fluent's own right-click menus (Tile.jsx, TabMenuItems.jsx, etc.).
window.addEventListener('contextmenu', (e) => {
  const el = e.target;
  const editable = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
  if (!editable) e.preventDefault();
});

// `__PAPERWALL_BOOT__` is injected by src-tauri/src/lib.rs's `initialization_script`, which
// only runs inside the app's own window — so its absence means this page was opened directly
// (e.g. someone visited the bare Vite dev server URL in a regular browser tab).
document.documentElement.dataset.theme = window.__PAPERWALL_BOOT__?.initialTheme || 'dark';

if (!window.__PAPERWALL_BOOT__) {
  root.render(
    <div className="fatal">
      <h1>Open PaperWall as an app</h1>
      <p>
        This page only works inside the PaperWall window, not in a web browser.
        Close this tab and start the app with <b>npm run tauri dev</b>.
      </p>
    </div>,
  );
} else {
  root.render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>,
  );
  // Tells Rust the page has actually painted something, so it can show the (until-now hidden)
  // window with no flash of an empty white/black frame — see `signal_ready` in src-tauri/src/lib.rs.
  invoke('signal_ready').catch(() => {});
}
