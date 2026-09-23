mod library;
mod protocol;
mod scan;
mod state;
mod theme;
mod wallpaper;

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

use library::{ImportResult, Registry, ThumbCache, WallpaperItem};

// ---------------------------------------------------------------------------------------
// Commands — one per Electron `ipcMain.handle(...)` call. See electron/preload.js for the
// original bridge surface; src/api.js on the frontend maps 1:1 onto these.
// ---------------------------------------------------------------------------------------

#[tauri::command]
fn import_images(registry: tauri::State<Registry>, paths: Vec<String>) -> ImportResult {
    let files: Vec<PathBuf> = paths.into_iter().map(PathBuf::from).collect();
    library::import_images(&registry, &files)
}

#[tauri::command]
fn import_folder(registry: tauri::State<Registry>, path: String) -> ImportResult {
    library::import_folder(&registry, std::path::Path::new(&path))
}

#[tauri::command]
fn import_zip(app: AppHandle, registry: tauri::State<Registry>, path: String) -> Result<ImportResult, String> {
    library::import_zip(&registry, std::path::Path::new(&path), &state::imported_dir(&app))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RescanCategoryInput {
    id: String,
    folders: Vec<String>,
    paths: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RescanResult {
    id: String,
    found: Vec<WallpaperItem>,
    missing: Vec<String>,
}

// Re-reads the folders a tab's categories were imported from: reports new images, and files
// that were deleted. Files whose whole folder is missing (e.g. an unplugged drive) are kept.
#[tauri::command]
fn rescan(registry: tauri::State<Registry>, categories: Vec<RescanCategoryInput>) -> Vec<RescanResult> {
    categories
        .into_iter()
        .map(|c| {
            let mut found = Vec::new();
            for dir in &c.folders {
                let dir_path = std::path::Path::new(dir);
                if dir_path.is_dir() {
                    found.extend(library::import_folder(&registry, dir_path).items);
                }
            }
            let missing = c
                .paths
                .into_iter()
                .filter(|p| {
                    let path = std::path::Path::new(p);
                    !path.exists() && path.parent().map(|d| d.exists()).unwrap_or(false)
                })
                .collect();
            RescanResult { id: c.id, found, missing }
        })
        .collect()
}

#[tauri::command]
fn set_wallpaper(app: AppHandle, registry: tauri::State<Registry>, id: String) -> Result<(), String> {
    let file = registry.lookup(&id).ok_or_else(|| "Unknown wallpaper.".to_string())?;
    wallpaper::set_wallpaper(&file, &state::converted_dir(&app))
}

#[tauri::command]
fn reveal(registry: tauri::State<Registry>, app: AppHandle, id: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    if let Some(file) = registry.lookup(&id) {
        app.opener().reveal_item_in_dir(file).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn theme_apply(window: tauri::WebviewWindow, name: String) -> String {
    theme::apply(&window, &name).to_string()
}

#[tauri::command]
fn clear_supported() -> bool {
    theme::clear_supported()
}

// Called once the frontend has written its latest state back to disk in response to the
// `paperwall://flush-and-close` event below — see the note above `on_window_event`.
#[tauri::command]
fn confirm_close(window: tauri::WebviewWindow) {
    let _ = window.destroy();
}

// Called once from src/main.jsx right after React's first render. Showing the window only once
// the page has actually painted something (rather than as soon as it's created) is what
// Electron's `show: false` + `ready-to-show` did; this is the equivalent trigger for it.
#[tauri::command]
fn signal_ready(window: tauri::WebviewWindow) {
    if !window.is_visible().unwrap_or(true) {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(Registry::default())
        .invoke_handler(tauri::generate_handler![
            state::state_load,
            state::state_save,
            import_images,
            import_folder,
            import_zip,
            rescan,
            set_wallpaper,
            reveal,
            theme_apply,
            clear_supported,
            confirm_close,
            signal_ready,
        ]);

    builder = protocol::register(builder);

    builder
        .setup(|app| {
            let handle = app.handle().clone();
            app.manage(ThumbCache::new(state::thumbs_dir(&handle)));

            // Start in the saved theme, no flash — mirrors `applyTheme(readState()?.theme)`
            // running before `createWindow()` on the Electron side.
            let saved_theme = {
                let registry = app.state::<Registry>();
                state::state_load(handle.clone(), registry)
                    .and_then(|v| v.get("theme").and_then(|t| t.as_str()).map(|s| s.to_string()))
                    .unwrap_or_else(|| "dark".to_string())
            };
            let spec = theme::resolve(&saved_theme);

            // Baked into the page before any of its own scripts run — the equivalent of the
            // `--paperwall-theme=`/`--paperwall-clear` argv flags read by electron/preload.js.
            let boot_script = format!(
                "window.__PAPERWALL_BOOT__ = {{ initialTheme: {:?}, clearSupported: {} }};",
                spec.key,
                theme::clear_supported()
            );

            let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("PaperWall")
                .inner_size(1240.0, 800.0)
                .min_inner_size(900.0, 600.0)
                .visible(false)
                .decorations(false)
                .transparent(true)
                .shadow(true)
                .background_color(tauri::window::Color(spec.bg.0, spec.bg.1, spec.bg.2, spec.bg.3))
                .initialization_script(&boot_script)
                .build()?;

            // Re-applies via the same runtime path Settings uses, so Acrylic actually turns on
            // for a "clear" start (the builder above only sets the plain background colour).
            theme::apply(&window, spec.key);

            // Ask the frontend to flush state before we actually let the window close — Tauri's
            // `invoke` is always async, so there's no drop-in replacement for Electron's
            // synchronous `ipcRenderer.sendSync('state:saveSync', ...)` on `beforeunload`. This
            // intercept-then-confirm round trip is the closest equivalent: see `confirm_close`
            // above and the listener in src/state.jsx.
            let close_window = window.clone();
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = close_window.emit("paperwall://flush-and-close", ());
                }
            });

            // Show on first paint (src/main.jsx calls `signal_ready` right after React's first
            // render — see the comment above that command)...
            // ...with a 4-second safety net in case that call never arrives, exactly like
            // Electron's own `show:false` + `ready-to-show` + a timeout fallback.
            let fallback_window = window.clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(Duration::from_secs(4)).await;
                if !fallback_window.is_visible().unwrap_or(true) {
                    let _ = fallback_window.show();
                    let _ = fallback_window.set_focus();
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
