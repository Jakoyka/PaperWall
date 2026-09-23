// Sets the Windows desktop wallpaper.
// Port of electron/wallpaper.js — but calling SystemParametersInfoW directly instead of
// shelling out to `powershell.exe`. See the "wallpaper.rs" note in the port write-up for why.

use std::path::{Path, PathBuf};

// Formats Windows accepts directly. Anything else is converted to PNG first.
const DIRECT: &[&str] = &["jpg", "jpeg", "png", "bmp"];

fn is_direct(file: &Path) -> bool {
    file.extension()
        .and_then(|e| e.to_str())
        .map(|e| DIRECT.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

/// Converts `file` to a PNG under `convert_dir` if Windows can't use its format directly,
/// then points the desktop at it. Mirrors `setWallpaper` in electron/wallpaper.js.
pub fn set_wallpaper(file: &Path, convert_dir: &Path) -> Result<(), String> {
    if !file.exists() {
        return Err("The image file no longer exists.".into());
    }

    let target: PathBuf = if is_direct(file) {
        file.to_path_buf()
    } else {
        let img = image::open(file).map_err(|_| "This image format is not supported. Convert it to JPG or PNG.".to_string())?;
        std::fs::create_dir_all(convert_dir).map_err(|e| e.to_string())?;
        let stem: String = file
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("wallpaper")
            .chars()
            .map(|c| if c.is_alphanumeric() || " -_.".contains(c) { c } else { '_' })
            .collect();
        let out = convert_dir.join(format!("{stem}.png"));
        img.save(&out).map_err(|e| e.to_string())?;
        out
    };

    apply(&target)
}

#[cfg(target_os = "windows")]
fn apply(file: &Path) -> Result<(), String> {
    use std::ffi::c_void;
    use std::os::windows::ffi::OsStrExt;
    use windows::Win32::UI::WindowsAndMessaging::{
        SystemParametersInfoW, SPIF_SENDCHANGE, SPIF_UPDATEINIFILE, SPI_SETDESKWALLPAPER,
    };

    // Null-terminated UTF-16 — what SystemParametersInfoW expects for this action. `file` is
    // already absolute (it came from a native dialog, or a path we constructed ourselves).
    let mut wide: Vec<u16> = file.as_os_str().encode_wide().chain(std::iter::once(0)).collect();

    let ok = unsafe {
        SystemParametersInfoW(
            SPI_SETDESKWALLPAPER,
            0,
            Some(wide.as_mut_ptr() as *mut c_void),
            SPIF_UPDATEINIFILE | SPIF_SENDCHANGE,
        )
    };
    match ok {
        Ok(()) => Ok(()),
        Err(e) => Err(format!("Windows refused to change the wallpaper ({e}).")),
    }
}

#[cfg(not(target_os = "windows"))]
fn apply(_file: &Path) -> Result<(), String> {
    Err("Setting the wallpaper only works on Windows.".into())
}
