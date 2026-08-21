use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;

// The engine sidecar serves git over http://127.0.0.1:7733. It is spawned at
// startup and left running for the lifetime of the app; the frontend polls
// /health and shows a banner if it never comes up.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let sidecar = handle.shell().sidecar("powergit-engine").expect("sidecar not found");
                let (mut rx, _child) = sidecar
                    .args(["--urls", "http://127.0.0.1:7733"])
                    .spawn()
                    .expect("failed to spawn powergit-engine sidecar");
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stderr(line) => {
                            println!("[engine] {}", String::from_utf8_lossy(&line));
                        }
                        CommandEvent::Terminated(_) => break,
                        _ => {}
                    }
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running PowerGit");
}
