// Switches the window itself (glass material, background colour, title-bar caption colours).
// The page recolours itself separately, same as on the Electron side (see `applyTheme` in
// electron/main.js). The three theme keys are the same: "dark" / "light" / "clear".

use tauri::WebviewWindow;

pub struct ThemeSpec {
    pub key: &'static str,
    pub bg: (u8, u8, u8, u8),
}

/// Windows 11 22H2 is build 22621 — the first build where Acrylic-on-a-window (rather than
/// just Acrylic-behind-a-flyout) is reliable. Read straight from the registry rather than
/// `GetVersionEx`, which reports a lied-about version unless the exe is manifested for the
/// running Windows release.
#[cfg(target_os = "windows")]
fn windows_build_number() -> u32 {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;
    RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey(r"SOFTWARE\Microsoft\Windows NT\CurrentVersion")
        .and_then(|key| key.get_value::<String, _>("CurrentBuildNumber"))
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(0)
}
#[cfg(not(target_os = "windows"))]
fn windows_build_number() -> u32 {
    0
}

pub fn clear_supported() -> bool {
    windows_build_number() >= 22621 || std::env::var("PAPERWALL_FORCE_CLEAR").is_ok()
}

/// "clear" only works where the window can be see-through; otherwise fall back to dark,
/// same rule as `resolveTheme` on the Electron side.
pub fn resolve(name: &str) -> ThemeSpec {
    if name == "clear" && clear_supported() {
        return ThemeSpec { key: "clear", bg: (0, 0, 0, 0) };
    }
    if name == "light" {
        return ThemeSpec { key: "light", bg: (0xf3, 0xf3, 0xf3, 0xff) };
    }
    ThemeSpec { key: "dark", bg: (0x20, 0x20, 0x20, 0xff) }
}

#[cfg(target_os = "windows")]
pub fn apply(window: &WebviewWindow, name: &str) -> &'static str {
    use tauri::utils::config::{Color, WindowEffectsConfig};
    use tauri::utils::WindowEffect;

    let spec = resolve(name);
    let _ = window.set_background_color(Some(Color(spec.bg.0, spec.bg.1, spec.bg.2, spec.bg.3)));

    let effects = if spec.key == "clear" {
        Some(WindowEffectsConfig {
            effects: vec![WindowEffect::Acrylic],
            state: None,
            radius: None,
            color: Some(Color(0, 0, 0, 0)),
        })
    } else {
        None // clears any previously-applied effect when switching back to dark/light
    };
    let _ = window.set_effects(effects);
    spec.key
}

#[cfg(not(target_os = "windows"))]
pub fn apply(_window: &WebviewWindow, name: &str) -> &'static str {
    resolve(name).key
}
