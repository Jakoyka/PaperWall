// Helpers for finding images inside a folder.
// Port of electron/scan.js.

use std::cmp::Ordering;
use std::path::{Path, PathBuf};

pub const IMAGE_EXTS: &[&str] = &["jpg", "jpeg", "png", "webp", "bmp"];

pub fn is_image(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| IMAGE_EXTS.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

pub fn pretty_name(path: &Path) -> String {
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or_default();
    stem.replace('_', " ").split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Natural-order comparator: digit runs compare numerically, everything else compares as
/// (lowercased) text. Mirrors the `Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })`
/// used on the JS side closely enough for file listings (case-insensitive, "2" < "10").
pub fn natural_cmp(a: &str, b: &str) -> Ordering {
    let a = a.to_lowercase();
    let b = b.to_lowercase();
    let mut ai = a.chars().peekable();
    let mut bi = b.chars().peekable();
    loop {
        match (ai.peek().copied(), bi.peek().copied()) {
            (None, None) => return Ordering::Equal,
            (None, Some(_)) => return Ordering::Less,
            (Some(_), None) => return Ordering::Greater,
            (Some(ac), Some(bc)) => {
                if ac.is_ascii_digit() && bc.is_ascii_digit() {
                    let take_num = |it: &mut std::iter::Peekable<std::str::Chars>| {
                        let mut s = String::new();
                        while let Some(c) = it.peek() {
                            if c.is_ascii_digit() {
                                s.push(*c);
                                it.next();
                            } else {
                                break;
                            }
                        }
                        s
                    };
                    let an: u64 = take_num(&mut ai).parse().unwrap_or(0);
                    let bn: u64 = take_num(&mut bi).parse().unwrap_or(0);
                    match an.cmp(&bn) {
                        Ordering::Equal => continue,
                        other => return other,
                    }
                } else if ac == bc {
                    ai.next();
                    bi.next();
                    continue;
                } else {
                    return ac.cmp(&bc);
                }
            }
        }
    }
}

/// Every image in `dir` and (up to `depth` levels of) sub-folders, in natural order.
/// Mirrors electron/scan.js's `listImages`.
pub fn list_images(dir: &Path, depth: u32) -> Vec<PathBuf> {
    let mut entries: Vec<_> = match std::fs::read_dir(dir) {
        Ok(rd) => rd.filter_map(|e| e.ok()).collect(),
        Err(_) => return Vec::new(),
    };
    entries.sort_by(|a, b| natural_cmp(&a.file_name().to_string_lossy(), &b.file_name().to_string_lossy()));

    let mut out = Vec::new();
    for entry in entries {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        // Skips dotfiles, AppleDouble ("._foo") files, and macOS's __MACOSX folder.
        if name.starts_with('.') || name == "__MACOSX" {
            continue;
        }
        let path = entry.path();
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        if is_dir {
            if depth > 0 {
                out.extend(list_images(&path, depth - 1));
            }
        } else if is_image(&path) {
            out.push(path);
        }
    }
    out
}
