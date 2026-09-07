import { useCallback, useEffect, useRef, useState } from "react"

// Shared behaviour of the floating option pills (diff options, graph
// options; v0.14.1, owner: "the floating minibars ... blink or disappear").
// A MUI Select renders its menu outside the pill, so the pointer entering
// the menu used to count as leaving the pill, which collapsed and unmounted
// the open menu. The pill now stays expanded while the pointer is inside
// OR any of its menus is open OR the user pinned it by clicking the icon;
// when a menu closes, the next pointer move decides whether the pointer is
// still inside. Callers keep the expanded body mounted and only hide it.
export function useFloatingBar() {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [inside, setInside] = useState(false)
  const [menus, setMenus] = useState(0)
  const [pinned, setPinned] = useState(false)
  const expanded = inside || menus > 0 || pinned

  const menuProps = {
    onOpen: () => setMenus((m) => m + 1),
    onClose: () => setMenus((m) => Math.max(0, m - 1)),
  }

  // After the last menu closes the pointer may be anywhere: re-evaluate on
  // its next move instead of guessing.
  useEffect(() => {
    if (menus > 0) return
    const onMove = (e: MouseEvent) => {
      const root = rootRef.current
      setInside(root !== null && root.contains(e.target as Node))
    }
    document.addEventListener("mousemove", onMove, { once: true })
    return () => document.removeEventListener("mousemove", onMove)
  }, [menus])

  useEffect(() => {
    if (!pinned) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPinned(false)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [pinned])

  const togglePinned = useCallback(() => setPinned((p) => !p), [])

  return {
    rootRef,
    expanded,
    pinned,
    togglePinned,
    rootProps: {
      onMouseEnter: () => setInside(true),
      onMouseLeave: () => setInside(false),
    },
    menuProps,
  }
}
