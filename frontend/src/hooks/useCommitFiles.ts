import { useRef, useState } from "react"
import { describeThrown, type EngineClient, type RepoStatus, type StatusFile } from "../engine"
import type { CommitFileMenuTarget } from "../components/CommitFileContextMenu"

// File selection and file actions of the commit dialog (split out of
// CommitDialog in v0.13.14 to keep it under the lint size limit). Selection
// follows Git Extensions: click selects, Ctrl+click toggles, Shift+click
// ranges, double-click stages/unstages, right-click targets the row.
export function useCommitFiles({
  engine,
  status,
  onStatus,
  onError,
}: {
  engine: EngineClient
  status: RepoStatus | null
  onStatus: (status: RepoStatus) => void
  onError: (message: string) => void
}) {
  const [selected, setSelected] = useState<{ path: string; staged: boolean } | null>(null)
  const [selUnstaged, setSelUnstaged] = useState<Set<string>>(new Set())
  const [selStaged, setSelStaged] = useState<Set<string>>(new Set())
  const [menu, setMenu] = useState<CommitFileMenuTarget | null>(null)
  const [confirm, setConfirm] = useState<{ kind: "reset" | "delete"; staged: boolean; paths: string[] } | null>(null)
  const anchorRef = useRef<{ unstaged: number; staged: number }>({ unstaged: -1, staged: -1 })
  const setError = onError

  function clickRow(list: StatusFile[], staged: boolean, index: number, e: React.MouseEvent) {
    const setter = staged ? setSelStaged : setSelUnstaged
    const current = staged ? selStaged : selUnstaged
    if (e.shiftKey && anchorRef.current[staged ? "staged" : "unstaged"] >= 0) {
      const a = anchorRef.current[staged ? "staged" : "unstaged"]
      const [lo, hi] = [Math.min(a, index), Math.max(a, index)]
      const next = new Set(current)
      for (let i = lo; i <= hi; i++) next.add(list[i].path)
      setter(next)
    } else if (e.ctrlKey || e.metaKey) {
      const next = new Set(current)
      if (next.has(list[index].path)) next.delete(list[index].path)
      else next.add(list[index].path)
      setter(next)
      anchorRef.current[staged ? "staged" : "unstaged"] = index
    } else {
      setter(new Set([list[index].path]))
      anchorRef.current[staged ? "staged" : "unstaged"] = index
    }
    setSelected({ path: list[index].path, staged })
  }

  async function toggle(file: StatusFile) {
    try {
      onStatus(await engine.stage([file.path], file.staged))
      setSelected((cur) => (cur?.path === file.path ? null : cur))
    } catch (e) {
      setError(`stage failed: ${describeThrown(e)}`)
    }
  }

  async function stageSelection(staged: boolean) {
    const paths = [...(staged ? selStaged : selUnstaged)]
    if (paths.length === 0) return
    try {
      onStatus(await engine.stage(paths, staged))
      setSelStaged(new Set())
      setSelUnstaged(new Set())
    } catch (e) {
      setError(`stage failed: ${describeThrown(e)}`)
    }
  }

  async function stageAll(unstage: boolean) {
    const files = unstage ? status?.staged : status?.unstaged
    const paths = (files ?? []).map((f) => f.path)
    if (paths.length === 0) return
    try {
      onStatus(await engine.stage(paths, unstage))
      setSelStaged(new Set())
      setSelUnstaged(new Set())
    } catch (e) {
      setError(`stage failed: ${describeThrown(e)}`)
    }
  }

  function askConfirm(kind: "reset" | "delete", staged: boolean) {
    const paths = [...(staged ? selStaged : selUnstaged)]
    if (paths.length > 0) setConfirm({ kind, staged, paths })
  }

  async function runConfirmed() {
    if (!confirm) return
    const { kind, paths } = confirm
    setConfirm(null)
    try {
      onStatus(kind === "delete" ? await engine.deleteFiles(paths) : await engine.resetFiles(paths))
      setSelStaged(new Set())
      setSelUnstaged(new Set())
      setSelected(null)
    } catch (e) {
      setError(`${kind} failed: ${describeThrown(e)}`)
    }
  }

  // Right-click targets the row under the pointer: an unselected row becomes
  // the selection (Git Extensions behaviour), a selected one keeps the group.
  function openMenu(f: StatusFile, staged: boolean, x: number, y: number) {
    const current = staged ? selStaged : selUnstaged
    let count = current.size
    if (!current.has(f.path)) {
      ;(staged ? setSelStaged : setSelUnstaged)(new Set([f.path]))
      setSelected({ path: f.path, staged })
      count = 1
    }
    setMenu({ x, y, staged, path: f.path, count: Math.max(1, count) })
  }

  function clear() {
    setSelected(null)
    setSelUnstaged(new Set())
    setSelStaged(new Set())
    setMenu(null)
    setConfirm(null)
  }

  return {
    selected,
    setSelected,
    selUnstaged,
    selStaged,
    menu,
    setMenu,
    confirm,
    setConfirm,
    clickRow,
    toggle,
    stageSelection,
    stageAll,
    askConfirm,
    runConfirmed,
    openMenu,
    clear,
  }
}
