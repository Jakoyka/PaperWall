import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// See https://v2.tauri.app/start/frontend/vite/ — the parts that changed from the Electron
// version are: `clearScreen: false` (so Rust compiler errors from `tauri dev` stay visible),
// `server.watch.ignored` (don't rebuild the frontend when Rust recompiles into src-tauri/target),
// and reading the host/port Tauri sets on mobile. `base: './'` is gone — Tauri (unlike the old
// `file://` Electron load) serves the built app the same way the Vite dev server does, so
// root-relative asset URLs resolve correctly without it.
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 4000 },

  clearScreen: false,
  server: {
    host: host || '127.0.0.1',
    port: 5173,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] },
  },
});
