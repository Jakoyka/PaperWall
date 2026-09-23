// paperwall://app/thumb?id=...    small picture for the grid
// paperwall://app/preview?id=...  larger picture for the preview window
//
// Port of the `protocol.handle('paperwall', ...)` block in electron/main.js. Registered as an
// *asynchronous* scheme handler so a slow thumbnail decode never blocks the main/UI thread.
//
// NOTE (Windows-only nuance): WebView2 doesn't support arbitrary `scheme://` URLs the way
// Chromium (Electron) does — on Windows, Tauri serves a custom protocol named "paperwall" as
// `http://paperwall.localhost/...` instead. Since this app only targets Windows, the frontend
// builds URLs in that form directly (see src/api.js) rather than branching on OS.

use tauri::{AppHandle, Manager};

use crate::library::{Registry, ThumbCache};

fn mime_for(path: &std::path::Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase().as_str() {
        "png" => "image/png",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        _ => "image/jpeg",
    }
}

fn response(status: u16, content_type: &str, body: Vec<u8>) -> http::Response<Vec<u8>> {
    http::Response::builder()
        .status(status)
        .header("Content-Type", content_type)
        .header("Cache-Control", "public, max-age=31536000")
        .body(body)
        .unwrap_or_else(|_| http::Response::new(Vec::new()))
}

fn not_found() -> http::Response<Vec<u8>> {
    http::Response::builder().status(404).body(b"Not found".to_vec()).unwrap()
}

async fn handle<R: tauri::Runtime>(app: AppHandle<R>, path: String, query: String) -> http::Response<Vec<u8>> {
    let id = query
        .split('&')
        .find_map(|kv| kv.strip_prefix("id=").map(|v| v.to_string()));
    let Some(id) = id else { return not_found() };

    let registry = app.state::<Registry>();
    let Some(file) = registry.lookup(&id) else { return not_found() };

    let thumbs = app.state::<ThumbCache>();
    let generated = match path.as_str() {
        "/thumb" => Some(thumbs.get(file.clone(), 480, 80).await),
        "/preview" => Some(thumbs.get(file.clone(), 1800, 88).await),
        _ => None,
    };

    if let Some(Some(bytes)) = generated {
        return response(200, "image/jpeg", bytes);
    }

    // Fall back to the original file (thumbnail generation failed, or an unrecognised path).
    match tokio::fs::read(&file).await {
        Ok(bytes) => response(200, mime_for(&file), bytes),
        Err(_) => not_found(),
    }
}

pub fn register<R: tauri::Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    builder.register_asynchronous_uri_scheme_protocol("paperwall", move |app, request, responder| {
        // `app` here is a `UriSchemeContext`, not a plain `AppHandle` — `.app_handle()` is my
        // best guess at getting one out of it (untested: this file's Windows-only dependents
        // meant I couldn't compile it in the sandbox this port was written in). If this line
        // doesn't compile, `cargo doc --open` for `tauri::UriSchemeContext` will show the right
        // accessor — everything below this line only needs a plain `AppHandle`.
        let app = app.app_handle().clone();
        let path = request.uri().path().to_string();
        let query = request.uri().query().unwrap_or("").to_string();
        tauri::async_runtime::spawn(async move {
            responder.respond(handle(app, path, query).await);
        });
    })
}
