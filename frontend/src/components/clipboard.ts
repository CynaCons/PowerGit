// navigator.clipboard requires a secure context and can be missing/blocked
// under tauri:// (no https, no permission prompt shown yet); fall back to
// the classic hidden-textarea + execCommand trick, which works from any
// focused document regardless of origin.
export async function copyToClipboard(text: string): Promise<void> {
  try {
    if (!navigator.clipboard?.writeText) throw new Error("clipboard API unavailable")
    await navigator.clipboard.writeText(text)
    return
  } catch {
    // fall through to the textarea fallback below
  }
  const textarea = document.createElement("textarea")
  textarea.value = text
  textarea.style.position = "fixed"
  textarea.style.opacity = "0"
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  try {
    document.execCommand("copy")
  } finally {
    document.body.removeChild(textarea)
  }
}
