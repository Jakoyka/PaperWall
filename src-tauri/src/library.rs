// Everything that touches wallpaper files: scanning, thumbnails, importing ZIPs.
// Port of electron/library.js.

use std::collections::HashMap;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use image::imageops::FilterType;
use image::{ExtendedColorType, ImageEncoder};
use serde::Serialize;
use sha1::{Digest, Sha1};
use tokio::sync::Semaphore;

use crate::scan;

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

/// sha1 of the (lower-cased, backslash-normalised) absolute path. Matches Electron's
/// `crypto.createHash('sha1').update(path.resolve(file).toLowerCase())`, minus the actual
/// filesystem `resolve` — every path we hand this already comes in absolute (from a native
/// dialog, a saved state file, or a scan we just did), so we don't touch the filesystem for it.
fn id_for(path: &Path) -> String {
    let normalised = path.to_string_lossy().replace('/', "\\").to_lowercase();
    let mut hasher = Sha1::new();
    hasher.update(normalised.as_bytes());
    hex(&hasher.finalize())[..16].to_string()
}

/// The UI never sees raw file paths in image URLs, only short ids (`Registry::register`/`lookup`).
#[derive(Default)]
pub struct Registry(Mutex<HashMap<String, PathBuf>>);

impl Registry {
    pub fn register(&self, path: &Path) -> String {
        let id = id_for(path);
        self.0.lock().unwrap().insert(id.clone(), path.to_path_buf());
        id
    }

    pub fn lookup(&self, id: &str) -> Option<PathBuf> {
        self.0.lock().unwrap().get(id).cloned()
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WallpaperItem {
    pub id: String,
    pub name: String,
    pub path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub name: Option<String>,
    pub folder: Option<String>,
    pub items: Vec<WallpaperItem>,
}

fn to_item(registry: &Registry, path: &Path) -> WallpaperItem {
    WallpaperItem {
        id: registry.register(path),
        name: scan::pretty_name(path),
        path: path.to_string_lossy().to_string(),
    }
}

pub fn import_images(registry: &Registry, files: &[PathBuf]) -> ImportResult {
    let items = files
        .iter()
        .filter(|f| scan::is_image(f))
        .map(|f| to_item(registry, f))
        .collect();
    ImportResult { name: None, folder: None, items }
}

pub fn import_folder(registry: &Registry, dir: &Path) -> ImportResult {
    let items = scan::list_images(dir, 4).iter().map(|p| to_item(registry, p)).collect();
    ImportResult {
        name: Some(dir.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default()),
        folder: Some(dir.to_string_lossy().to_string()),
        items,
    }
}

fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| if r#"<>:"/\|?*"#.contains(c) || (c as u32) < 0x20 { '_' } else { c })
        .collect()
}

pub fn import_zip(registry: &Registry, zip_path: &Path, dest_root: &Path) -> Result<ImportResult, String> {
    let file = std::fs::File::open(zip_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

    let label = zip_path.file_stem().and_then(|s| s.to_str()).unwrap_or("archive").to_string();
    let safe_label: String = label
        .chars()
        .filter(|c| c.is_alphanumeric() || " -_().".contains(*c))
        .take(60)
        .collect();
    let safe_label = if safe_label.trim().is_empty() { "archive".to_string() } else { safe_label };
    let nonce = format!(
        "{:06x}",
        SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.subsec_nanos()).unwrap_or(0) & 0xff_ffff
    );
    let dest = dest_root.join(format!("{safe_label}-{nonce}"));
    std::fs::create_dir_all(&dest).map_err(|e| e.to_string())?;

    let mut used: std::collections::HashSet<String> = Default::default();
    let mut files: Vec<PathBuf> = Vec::new();

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        if entry.is_dir() {
            continue;
        }
        let entry_name = entry.name().replace('\\', "/");
        let base = entry_name.rsplit('/').next().unwrap_or(&entry_name).to_string();
        if entry_name.contains("__MACOSX/") || base.starts_with('.') {
            continue;
        }
        let ext = Path::new(&base)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();
        if !scan::IMAGE_EXTS.contains(&ext.as_str()) {
            continue;
        }

        let clean_base = sanitize_filename(&base);
        let stem = Path::new(&clean_base).file_stem().and_then(|s| s.to_str()).unwrap_or("file").to_string();
        let mut candidate = clean_base.clone();
        let mut n = 2;
        while used.contains(&candidate.to_lowercase()) {
            candidate = format!("{stem} ({n}).{ext}");
            n += 1;
        }
        used.insert(candidate.to_lowercase());

        let mut buf = Vec::new();
        entry.read_to_end(&mut buf).map_err(|e| e.to_string())?;
        let target = dest.join(&candidate);
        std::fs::write(&target, buf).map_err(|e| e.to_string())?;
        files.push(target);
    }

    files.sort_by(|a, b| {
        scan::natural_cmp(
            &a.file_name().unwrap_or_default().to_string_lossy(),
            &b.file_name().unwrap_or_default().to_string_lossy(),
        )
    });
    let items = files.iter().map(|f| to_item(registry, f)).collect();
    Ok(ImportResult { name: Some(label), folder: None, items })
}

// --- thumbnails -------------------------------------------------------------------------
// Decoding big images is heavy, so a semaphore of 1 serialises the work (mirrors the
// Electron side's one-job-at-a-time promise chain) while still running off the main thread.
pub struct ThumbCache {
    dir: PathBuf,
    gate: Semaphore,
}

impl ThumbCache {
    pub fn new(dir: PathBuf) -> Self {
        let _ = std::fs::create_dir_all(&dir);
        Self { dir, gate: Semaphore::new(1) }
    }

    fn cache_key(&self, file: &Path, width: u32, quality: u8) -> Option<PathBuf> {
        let meta = std::fs::metadata(file).ok()?;
        let mtime = meta.modified().ok()?.duration_since(UNIX_EPOCH).ok()?.as_millis();
        let key_src = format!("{}|{}|{}|{}|{}|v1", file.to_string_lossy(), meta.len(), mtime, width, quality);
        let mut hasher = Sha1::new();
        hasher.update(key_src.as_bytes());
        let key = hex(&hasher.finalize())[..24].to_string();
        Some(self.dir.join(format!("{key}.jpg")))
    }

    /// Returns a cached or freshly-generated JPEG thumbnail, resized to `width` (capped;
    /// smaller originals are left as-is) at the given JPEG quality. `None` means "couldn't
    /// decode this image" — the caller falls back to serving the original file.
    pub async fn get(&self, file: PathBuf, width: u32, quality: u8) -> Option<Vec<u8>> {
        if let Some(cached) = self.cache_key(&file, width, quality) {
            if let Ok(bytes) = tokio::fs::read(&cached).await {
                return Some(bytes);
            }
            let _permit = self.gate.acquire().await.ok()?;
            let result = tokio::task::spawn_blocking(move || generate_thumbnail(&file, width, quality))
                .await
                .ok()
                .flatten();
            if let Some(bytes) = &result {
                let _ = tokio::fs::write(&cached, bytes).await;
            }
            result
        } else {
            // Couldn't stat the file (e.g. removable drive unplugged); try anyway, uncached.
            let _permit = self.gate.acquire().await.ok()?;
            tokio::task::spawn_blocking(move || generate_thumbnail(&file, width, quality)).await.ok().flatten()
        }
    }
}

fn generate_thumbnail(file: &Path, width: u32, quality: u8) -> Option<Vec<u8>> {
    let img = image::open(file).ok()?;
    let resized = if img.width() > width {
        let new_h = ((img.height() as f64) * (width as f64) / (img.width() as f64)).round().max(1.0) as u32;
        img.resize_exact(width, new_h, FilterType::Lanczos3)
    } else {
        img
    };
    let rgb = resized.to_rgb8();
    let mut buf = Vec::new();
    let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, quality);
    encoder.write_image(rgb.as_raw(), rgb.width(), rgb.height(), ExtendedColorType::Rgb8).ok()?;
    Some(buf)
}
