#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // v0.14.2, owner on the Linux AppImage: the window went black and
    // stopped redrawing while the page's script kept running. WebKitGTK's
    // DMA-BUF renderer is the well-known cause of exactly that on some
    // driver/compositor combinations (NVIDIA, some Wayland sessions), and
    // this environment variable is its documented switch. It has to be set
    // before WebKit initialises, i.e. here. POWERGIT_KEEP_DMABUF=1 keeps the
    // default renderer for comparison; an explicit value is left alone.
    #[cfg(target_os = "linux")]
    {
        const VAR: &str = "WEBKIT_DISABLE_DMABUF_RENDERER";
        if std::env::var_os(VAR).is_none() && std::env::var_os("POWERGIT_KEEP_DMABUF").is_none() {
            std::env::set_var(VAR, "1");
        }
    }
    powergit_lib::run()
}
