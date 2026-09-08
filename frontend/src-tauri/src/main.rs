#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Linux display stack (owner freezes on the AppImage, 2026-09-08):
    // - v0.14.2: WebKitGTK's DMA-BUF renderer off, the documented switch for
    //   black, non-redrawing views on some driver/compositor combinations.
    // - v0.15.0: the freeze came back with DMA-BUF off while the page kept
    //   producing frames, i.e. the GTK side that presents them died. The
    //   container harness has always run the AppImage with compositing mode
    //   off and never showed a black window, so that is now the default too.
    //   The AppImage's GTK packaging hook forces GDK_BACKEND=x11 (XWayland
    //   on a Wayland session); POWERGIT_WAYLAND=1 drops it so GTK talks
    //   Wayland directly (opt-in: the frameless title bar's drag and resize
    //   under Wayland are unverified).
    // Every switch has to be set before WebKit initialises, i.e. here. An
    // explicit value from the environment is left alone.
    #[cfg(target_os = "linux")]
    {
        let set_default = |var: &str, keep: &str| {
            if std::env::var_os(var).is_none() && std::env::var_os(keep).is_none() {
                std::env::set_var(var, "1");
            }
        };
        set_default("WEBKIT_DISABLE_DMABUF_RENDERER", "POWERGIT_KEEP_DMABUF");
        set_default("WEBKIT_DISABLE_COMPOSITING_MODE", "POWERGIT_KEEP_COMPOSITING");
        if std::env::var_os("POWERGIT_WAYLAND").is_some() && std::env::var_os("WAYLAND_DISPLAY").is_some() {
            std::env::remove_var("GDK_BACKEND");
        }
    }
    powergit_lib::run()
}
