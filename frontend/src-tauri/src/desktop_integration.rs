//! Linux AppImage desktop integration (v0.13.19).
//!
//! Owner: "On Linux my AppImage doesn't get the icon. On GNOME." GNOME
//! (Wayland in particular) never takes the icon from the window: it maps
//! the window's app id (`powergit`, the binary name) to an installed
//! `powergit.desktop` and shows that entry's `Icon`. An AppImage installs
//! nothing, so the dock and Alt-Tab fall back to the generic gear.
//!
//! When running as an AppImage (`$APPIMAGE` is set by the runtime) we write
//! `~/.local/share/applications/powergit.desktop` pointing at the image and
//! drop the bundled PNGs into the hicolor theme. Idempotent (only rewrites
//! when the content changed, e.g. the AppImage moved), quiet, and skipped
//! entirely when `POWERGIT_NO_INTEGRATE` is set. Removing the two files
//! undoes it.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

const ICONS: [(u32, &[u8]); 3] = [
    (128, include_bytes!("../icons/128x128.png")),
    (256, include_bytes!("../icons/128x128@2x.png")),
    (512, include_bytes!("../icons/icon.png")),
];

/// The desktop entry for an AppImage at `appimage`. `%` in the path is
/// doubled as the spec requires for Exec, and the path is quoted so spaces
/// survive.
pub fn desktop_entry(appimage: &str, version: &str) -> String {
    let exec = appimage.replace('%', "%%").replace('"', "\\\"");
    format!(
        "[Desktop Entry]\n\
         Type=Application\n\
         Name=PowerGit\n\
         Comment=Git client with a Git Extensions-style graph\n\
         Exec=\"{exec}\" %U\n\
         Icon=powergit\n\
         Terminal=false\n\
         Categories=Development;RevisionControl;\n\
         StartupWMClass=powergit\n\
         X-AppImage-Version={version}\n\
         X-PowerGit-Integrated=true\n"
    )
}

/// XDG data home: `$XDG_DATA_HOME`, else `$HOME/.local/share`.
fn data_home() -> Option<PathBuf> {
    if let Some(p) = std::env::var_os("XDG_DATA_HOME").filter(|p| !p.is_empty()) {
        return Some(PathBuf::from(p));
    }
    std::env::var_os("HOME")
        .filter(|h| !h.is_empty())
        .map(|h| Path::new(&h).join(".local/share"))
}

fn write_if_changed(path: &Path, bytes: &[u8]) -> std::io::Result<bool> {
    if fs::read(path).map(|cur| cur == bytes).unwrap_or(false) {
        return Ok(false);
    }
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    fs::write(path, bytes)?;
    Ok(true)
}

/// Runs the integration; returns a one-line summary for the engine log, or
/// None when there was nothing to do (not an AppImage, opted out).
pub fn integrate(version: &str) -> Option<String> {
    let appimage = std::env::var("APPIMAGE").ok().filter(|p| !p.is_empty())?;
    if std::env::var_os("POWERGIT_NO_INTEGRATE").is_some() {
        return Some("desktop integration skipped (POWERGIT_NO_INTEGRATE)".into());
    }
    let data = data_home()?;
    let mut changed = 0usize;
    let mut failed: Option<String> = None;
    for (size, bytes) in ICONS {
        let path = data.join(format!("icons/hicolor/{size}x{size}/apps/powergit.png"));
        match write_if_changed(&path, bytes) {
            Ok(true) => changed += 1,
            Ok(false) => {}
            Err(e) => failed = Some(format!("{}: {e}", path.display())),
        }
    }
    let desktop = data.join("applications/powergit.desktop");
    match write_if_changed(&desktop, desktop_entry(&appimage, version).as_bytes()) {
        Ok(true) => changed += 1,
        Ok(false) => {}
        Err(e) => failed = Some(format!("{}: {e}", desktop.display())),
    }
    if let Some(f) = failed {
        return Some(format!("desktop integration failed: {f}"));
    }
    if changed == 0 {
        return Some(format!("desktop entry up to date: {}", desktop.display()));
    }
    // Best effort: GNOME picks new entries up on its own, but the caches
    // make it immediate where the tools exist.
    let _ = Command::new("update-desktop-database")
        .arg(data.join("applications"))
        .status();
    let _ = Command::new("gtk-update-icon-cache")
        .args(["-q", "-t", "-f"])
        .arg(data.join("icons/hicolor"))
        .status();
    Some(format!(
        "desktop entry written: {} (icon + {} files)",
        desktop.display(),
        changed
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn desktop_entry_points_at_the_image_and_names_the_window_class() {
        let e = desktop_entry("/home/me/Apps/Power Git 100%.AppImage", "0.13.19");
        assert!(e.starts_with("[Desktop Entry]\n"));
        assert!(e.contains("Exec=\"/home/me/Apps/Power Git 100%%.AppImage\" %U\n"));
        assert!(e.contains("Icon=powergit\n"));
        assert!(e.contains("StartupWMClass=powergit\n"));
        assert!(e.contains("X-AppImage-Version=0.13.19\n"));
    }

    #[test]
    fn bundled_icons_are_real_pngs() {
        for (_, bytes) in ICONS {
            assert_eq!(&bytes[..8], b"\x89PNG\r\n\x1a\n");
        }
    }

    #[test]
    fn write_if_changed_is_idempotent() {
        let dir = std::env::temp_dir().join(format!("powergit-di-{}", std::process::id()));
        let path = dir.join("a/b/powergit.desktop");
        assert!(write_if_changed(&path, b"one").unwrap());
        assert!(!write_if_changed(&path, b"one").unwrap());
        assert!(write_if_changed(&path, b"two").unwrap());
        let _ = fs::remove_dir_all(dir);
    }
}
