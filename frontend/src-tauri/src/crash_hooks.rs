//! Platform crash signals for the watchdog (v0.14.2). WebKitGTK tells the
//! embedder when its web process dies (`web-process-terminated`);
//! WebView2 raises `ProcessFailed` for its renderer and GPU processes. The
//! heartbeat cannot see either quickly (a dead web process simply goes
//! silent), so the signal is handed to the watchdog as a crash, which
//! reloads the webview on the next tick instead of waiting out the
//! thresholds.

use tauri::{AppHandle, Manager};

/// Installs the platform hook on the main window. Failures only reach the
/// log: the heartbeat still covers the case, just later.
pub fn install(app: &AppHandle, on_crash: impl Fn(&AppHandle, String) + Send + Sync + 'static) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let handle = app.clone();
    let on_crash = std::sync::Arc::new(on_crash);
    let result = window.with_webview(move |webview| {
        #[cfg(target_os = "linux")]
        {
            use webkit2gtk::WebViewExt;
            let handle = handle.clone();
            let on_crash = on_crash.clone();
            webview.inner().connect_web_process_terminated(move |_, reason| {
                on_crash(&handle, format!("webkit web process terminated: {reason:?}"));
            });
        }
        #[cfg(windows)]
        {
            use webview2_com::Microsoft::Web::WebView2::Win32::COREWEBVIEW2_PROCESS_FAILED_KIND;
            use webview2_com::ProcessFailedEventHandler;
            // SAFETY: plain COM calls on the controller Tauri handed us, on
            // the thread that owns it (with_webview runs on the main thread).
            unsafe {
                let Ok(core) = webview.controller().CoreWebView2() else {
                    return;
                };
                let handle = handle.clone();
                let on_crash = on_crash.clone();
                let handler = ProcessFailedEventHandler::create(Box::new(move |_, args| {
                    let mut kind = COREWEBVIEW2_PROCESS_FAILED_KIND(-1);
                    if let Some(args) = args {
                        let _ = args.ProcessFailedKind(&mut kind);
                    }
                    on_crash(&handle, format!("webview2 process failed: kind {}", kind.0));
                    Ok(())
                }));
                let mut token = 0i64;
                let _ = core.add_ProcessFailed(&handler, &mut token);
            }
        }
        #[cfg(not(any(target_os = "linux", windows)))]
        {
            let _ = (&webview, &handle, &on_crash);
        }
    });
    if let Err(e) = result {
        eprintln!("crash hooks not installed: {e}");
    }
}
