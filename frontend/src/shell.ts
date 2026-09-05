/** True inside the Tauri webview (frameless window, native dialogs, engine config over IPC). */
export function isTauriShell(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}
