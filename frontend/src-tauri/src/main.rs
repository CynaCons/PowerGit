#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Linux display stack (owner freezes on the AppImage, 2026-09-08):
    // - v0.14.2: WebKitGTK's DMA-BUF renderer off, the documented switch for
    //   black, non-redrawing views on some driver/compositor combinations.
    //   Since WebKitGTK 2.43.2 this alone forces the non-accelerated backing
    //   store, so the v0.15.0 compositing switch below adds nothing on top of
    //   it; both stay so an older WebKitGTK behaves the same.
    // - v0.15.0: WEBKIT_DISABLE_COMPOSITING_MODE=1 as well.
    // - v0.15.6 (taskforce, docs/agents/context/ubuntu-freeze-taskforce-2026-09-10.md):
    //   the freezes happened with the main loop alive and the page still
    //   producing frames; what died was the presentation of the toplevel, and
    //   the top hypothesis is GTK3's X11 frame-sync stall under XWayland
    //   (mutter never sends the _NET_WM_FRAME_DRAWN the GdkFrameClock waits
    //   for). Every Ubuntu run so far was XWayland because the AppImage's GTK
    //   packaging hook forces GDK_BACKEND=x11. So on a Wayland session
    //   (WAYLAND_DISPLAY set) the shell now drops GDK_BACKEND and GTK talks
    //   Wayland directly; POWERGIT_X11=1 keeps the hook's x11 for anyone who
    //   needs it (there, POWERGIT_NO_FRAME_SYNC=1 is the fallback experiment,
    //   see probe.rs). POWERGIT_WAYLAND=1, the v0.15.0 opt-in, is still
    //   accepted and now means the default.
    // Every switch has to be set before WebKit/GTK initialise, i.e. here. An
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
        // POWERGIT_WAYLAND is not read: it asks for what is now the default.
        let keep_x11 = std::env::var("POWERGIT_X11").as_deref() == Ok("1");
        if std::env::var_os("WAYLAND_DISPLAY").is_some() && !keep_x11 {
            std::env::remove_var("GDK_BACKEND");
        }
    }
    powergit_lib::run()
}
