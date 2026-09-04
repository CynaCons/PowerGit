import { useEffect, useRef, useState } from "react"

export type ToolbarTier = "full" | "compact" | "overflow"

export type ChromeLayout = ReturnType<typeof useChromeLayout>

// Shell geometry: the bottom panel height and its active tab, the left
// panel's open state, and the command bar's responsive tier. None of it is
// persisted; it lives exactly as long as the window.
export function useChromeLayout() {
  const [bottomHeight, setBottomHeight] = useState(280)
  const [leftOpen, setLeftOpen] = useState(true)
  const [bottomTab, setBottomTab] = useState(0)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const dragState = useRef<{ startY: number; startH: number } | null>(null)

  const onDividerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragState.current = { startY: e.clientY, startH: bottomHeight }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onDividerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current) return
    const dy = dragState.current.startY - e.clientY
    const max = (contentRef.current?.clientHeight ?? 600) - 140
    setBottomHeight(Math.min(Math.max(120, dragState.current.startH + dy), Math.max(120, max)))
  }
  const onDividerUp = () => {
    dragState.current = null
  }

  // Command-bar overflow, the standard desktop/Fluent pattern: labels drop
  // to icons as the window narrows, then the secondary group collapses into
  // a single "More" menu. Driven by the toolbar's own measured width (not a
  // viewport media query) so it also reacts to the app being embedded or a
  // scrollbar appearing, and so nothing ever wraps or overflows off-screen.
  const toolbarRef = useRef<HTMLDivElement | null>(null)
  const [toolbarTier, setToolbarTier] = useState<ToolbarTier>("full")
  useEffect(() => {
    const el = toolbarRef.current
    if (!el) return
    const apply = (w: number) => setToolbarTier(w >= 1080 ? "full" : w >= 790 ? "compact" : "overflow")
    apply(el.getBoundingClientRect().width)
    // ResizeObserver is unavailable in no-DOM test shims; width then just
    // stays at whatever the first measurement produced.
    if (typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver((entries) => apply(entries[0].contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const overflowed = toolbarTier === "overflow"

  // Below the overflow width there is not enough room for both the ref panel
  // (232px fixed) and a readable grid: the Author/Date/SHA columns get pushed
  // off the right edge. Collapse the panel automatically, and restore it when
  // the window grows again — but only if we were the ones who closed it, so a
  // deliberate Ctrl+B stays honoured.
  const autoCollapsed = useRef(false)
  useEffect(() => {
    if (overflowed) {
      setLeftOpen((open) => {
        if (open) autoCollapsed.current = true
        return false
      })
    } else if (autoCollapsed.current) {
      autoCollapsed.current = false
      setLeftOpen(true)
    }
  }, [overflowed])

  // PowerGit is a desktop app: the WebView's own context menu must never
  // appear. Without this, right-clicking anywhere that is not a grid row —
  // including the MUI Menu's own backdrop, which is what the pointer lands
  // on for the *second* right-click while a menu is open — showed the
  // browser menu instead of ours. Capture phase, so it runs before React's
  // delegated handlers; no stopPropagation, so row handlers still fire.
  // Editable fields keep their native menu (cut/copy/paste).
  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null
      if (el?.closest("input, textarea, [contenteditable='true']")) return
      e.preventDefault()
    }
    document.addEventListener("contextmenu", onContextMenu, true)
    return () => document.removeEventListener("contextmenu", onContextMenu, true)
  }, [])

  return {
    bottomHeight,
    leftOpen,
    setLeftOpen,
    bottomTab,
    setBottomTab,
    contentRef,
    splitter: { onDividerDown, onDividerMove, onDividerUp },
    toolbarRef,
    toolbarTier,
  }
}
