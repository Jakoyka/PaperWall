// The only place the rest of the app talks to Tauri. Deliberately kept the same shape as the
// old `window.paperwall` bridge (electron/preload.js) so everything else — state.jsx, actions
// in App.jsx, Tile.jsx, PreviewDialog.jsx, SettingsPage.jsx, CustomPage.jsx — needed only an
// import-path change, not a rewrite.
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getVersion } from '@tauri-apps/api/app';
import { open } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';

// Baked into the page before load by `initialization_script` in src-tauri/src/lib.rs — the
// equivalent of the `--paperwall-theme=`/`--paperwall-clear` argv flags read in the old preload.
const boot = window.__PAPERWALL_BOOT__ || { initialTheme: 'dark', clearSupported: false };

const IMAGE_FILTER = { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] };

// Mirrors the `pick()` helper in electron/main.js: run a native dialog, bail out quietly if the
// user cancelled, and turn any failure into `{ error }` instead of throwing (CustomPage.jsx's
// `runImport` checks for `result.error`).
async function pick(dialogOptions, run) {
  try {
    const selection = await open(dialogOptions);
    if (!selection || (Array.isArray(selection) && selection.length === 0)) return null;
    return await run(selection);
  } catch (err) {
    return { error: err?.message || String(err) };
  }
}

const api = {
  initialTheme: boot.initialTheme,
  clearSupported: boot.clearSupported,
  applyTheme: (name) => invoke('theme_apply', { name }),

  loadState: () => invoke('state_load'),
  saveState: (state) => invoke('state_save', { state }),
  // Tauri's `invoke` is always async — there's no drop-in replacement for Electron's
  // `ipcRenderer.sendSync`. `onFlushAndClose` below (used from state.jsx) is what the window
  // close intercept in src-tauri/src/lib.rs calls instead of a synchronous save-on-unload.
  onFlushAndClose: (handler) => listen('paperwall://flush-and-close', handler),
  confirmClose: () => invoke('confirm_close'),

  pickImages: () =>
    pick({ multiple: true, filters: [IMAGE_FILTER] }, (files) =>
      invoke('import_images', { paths: Array.isArray(files) ? files : [files] }),
    ),
  pickFolder: () => pick({ directory: true }, (dir) => invoke('import_folder', { path: dir })),
  pickZip: () =>
    pick({ filters: [{ name: 'ZIP archive', extensions: ['zip'] }] }, (file) => invoke('import_zip', { path: file })),
  rescan: (categories) => invoke('rescan', { categories }),
  copyText: (text) => writeText(String(text)),

  setWallpaper: async (id) => {
    try {
      await invoke('set_wallpaper', { id });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err?.message || String(err) };
    }
  },
  reveal: (id) => invoke('reveal', { id }),
  openExternal: (url) => openUrl(url),
  getInfo: async () => ({ version: await getVersion() }),

  // Windows-only nuance: WebView2 can't load an arbitrary `scheme://` URL the way Electron's
  // Chromium could, so Tauri serves a custom protocol named "paperwall" as
  // `http://paperwall.localhost/...` on Windows. Since this app only ever runs on Windows,
  // that form is hardcoded rather than branched on OS — see src-tauri/src/protocol.rs.
  thumbUrl: (id) => `http://paperwall.localhost/thumb?id=${encodeURIComponent(id)}`,
  previewUrl: (id) => `http://paperwall.localhost/preview?id=${encodeURIComponent(id)}`,
};

export default api;
