// Saved state (custom categories, theme, language) — read/write of a single JSON file.
// Port of the `readState`/`writeState`/`state:load`/`state:save` parts of electron/main.js.
//
// This is a hand-written command rather than `tauri-plugin-store`: the store plugin is a
// generic key/value file and doesn't give us the atomic tmp-file-then-rename write or the
// "back up the corrupt file instead of silently discarding it" recovery this app relies on,
// so those are reimplemented directly against `std::fs` to match the original behaviour.

use serde_json::Value;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

use crate::library::Registry;

fn state_file(app: &AppHandle) -> PathBuf {
    // `app_data_dir()` is the Tauri equivalent of Electron's `app.getPath('userData')`.
    app.path().app_data_dir().expect("resolvable app data dir").join("paperwall-state.json")
}

pub fn imported_dir(app: &AppHandle) -> PathBuf {
    app.path().app_data_dir().expect("resolvable app data dir").join("imported")
}

pub fn converted_dir(app: &AppHandle) -> PathBuf {
    app.path().app_data_dir().expect("resolvable app data dir").join("converted")
}

pub fn thumbs_dir(app: &AppHandle) -> PathBuf {
    app.path().app_data_dir().expect("resolvable app data dir").join("thumbs")
}

fn read_state(app: &AppHandle) -> Option<Value> {
    let file = state_file(app);
    let text = match std::fs::read_to_string(&file) {
        Ok(t) => t,
        Err(_) => return None, // covers "file doesn't exist yet" (first launch)
    };
    match serde_json::from_str(&text) {
        Ok(value) => Some(value),
        Err(_) => {
            // Corrupt JSON: keep a copy instead of silently discarding the user's data.
            let _ = std::fs::copy(&file, format!("{}.broken", file.display()));
            None
        }
    }
}

fn write_state(app: &AppHandle, state: &Value) -> std::io::Result<()> {
    let file = state_file(app);
    if let Some(dir) = file.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let tmp = PathBuf::from(format!("{}.tmp", file.display()));
    std::fs::write(&tmp, serde_json::to_vec_pretty(state)?)?;
    std::fs::rename(&tmp, &file)
}

/// Walks the (loosely-typed, frontend-migrated) saved state and re-registers every wallpaper
/// path it finds, so `paperwall://.../thumb?id=...` can resolve them again after a restart.
/// Mirrors the loop in Electron's `state:load` handler.
fn reregister_paths(registry: &Registry, state: &Value) {
    let mut categories: Vec<&Value> = Vec::new();
    if let Some(legacy) = state.get("categories").and_then(|v| v.as_array()) {
        categories.extend(legacy);
    }
    if let Some(tabs) = state.get("tabs").and_then(|v| v.as_array()) {
        for tab in tabs {
            if let Some(cats) = tab.get("categories").and_then(|v| v.as_array()) {
                categories.extend(cats);
            }
        }
    }
    for cat in categories {
        if let Some(items) = cat.get("items").and_then(|v| v.as_array()) {
            for item in items {
                if let Some(path) = item.get("path").and_then(|v| v.as_str()) {
                    registry.register(std::path::Path::new(path));
                }
            }
        }
    }
}

#[tauri::command]
pub fn state_load(app: AppHandle, registry: tauri::State<Registry>) -> Option<Value> {
    let state = read_state(&app);
    if let Some(s) = &state {
        reregister_paths(&registry, s);
    }
    state
}

#[tauri::command]
pub fn state_save(app: AppHandle, state: Value) -> Result<(), String> {
    write_state(&app, &state).map_err(|e| e.to_string())
}
