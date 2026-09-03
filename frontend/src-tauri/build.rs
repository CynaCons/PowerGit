use std::{env, fs, path::Path};

/// The app version has one source: frontend/package.json. tauri.conf.json
/// points at it, and this exports it to Rust as POWERGIT_VERSION so nothing
/// reads Cargo.toml's placeholder (see scripts/check-version.mjs).
fn main() {
    let manifest_dir = env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR");
    let package_json = Path::new(&manifest_dir).join("../package.json");
    println!("cargo:rerun-if-changed={}", package_json.display());
    let text = fs::read_to_string(&package_json).expect("read frontend/package.json");
    let version = text
        .lines()
        .find_map(|line| {
            let line = line.trim();
            line.strip_prefix("\"version\":")
                .map(|rest| rest.trim().trim_end_matches(',').trim_matches('"').to_string())
        })
        .expect("\"version\" in frontend/package.json");
    println!("cargo:rustc-env=POWERGIT_VERSION={version}");
    tauri_build::build()
}
