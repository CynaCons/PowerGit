import type { EngineClient, RepoStatus, StatusFile } from "../engine"
import { editFile, openFile, setAssumeUnchanged, setSkipWorktree } from "../engine/files"
import type { CommitFileMenuActions } from "./CommitFileContextMenu"
import { isHiddenEntry, isUntracked, type FileMenuNode } from "./commitFileMenuModel"
import type { ListSnapshot } from "./commitFileMenuState"

// What a click on a file-menu item does (v0.16.0). The items that existed
// before v0.16.0 go to the dialog's callbacks, which confirm and refresh
// there; the new ones either call the engine straight away or open one of
// the menu's own dialogs (CommitFileMenuDialogs.tsx) first.

export type FilePending =
  | { kind: "reset-index"; paths: string[] }
  | { kind: "exclude-one"; path: string }
  | { kind: "exclude-many"; paths: string[] }
  | { kind: "untrack"; path: string }
  | { kind: "open-with"; path: string }
  | { kind: "rename"; path: string }

export type FileMenuDeps = {
  engine: EngineClient
  /** The rows the action applies to. */
  files: StatusFile[]
  staged: boolean
  /** The whole list, for "Stage all" / "Unstage all". */
  list: ListSnapshot | null
  actions: CommitFileMenuActions
  fail: (what: string) => (e: unknown) => void
  done: (status: RepoStatus) => void
  setPending: (pending: FilePending) => void
}

export function runFileMenuAction(node: FileMenuNode, deps: FileMenuDeps): void {
  const { engine, files, staged, list, actions, fail, done, setPending } = deps
  const paths = files.map((f) => f.path)
  const one = paths[0] ?? ""
  switch (node.id) {
    case "ctx-stage-selected":
      return actions.onStage()
    case "ctx-stage-all": {
      // Hidden (skip-worktree / assume-unchanged) rows are not stageable and
      // are not the dialog's rows either.
      const all = (list?.files ?? []).filter((f) => !isHiddenEntry(f)).map((f) => f.path)
      if (all.length === 0) return
      return void engine
        .stage(all, staged)
        .then(done)
        .catch(fail(staged ? "unstage all" : "stage all"))
    }
    case "ctx-reset-head":
      return actions.onReset()
    case "ctx-reset-index":
      return setPending({ kind: "reset-index", paths })
    case "ctx-difftool":
      return actions.onDifftool()
    case "ctx-open-file":
      return void openFile(engine, one).catch(fail("open"))
    case "ctx-open-with":
      return setPending({ kind: "open-with", path: one })
    case "ctx-edit-file":
      return void editFile(engine, one).catch(fail("edit"))
    case "ctx-move-file":
      return setPending({ kind: "rename", path: one })
    case "ctx-delete-file":
      return actions.onDelete()
    case "ctx-ignore-file":
      return actions.onIgnore()
    case "ctx-exclude-file":
      return setPending(paths.length === 1 ? { kind: "exclude-one", path: one } : { kind: "exclude-many", paths })
    case "ctx-skip-worktree": {
      const tracked = files.filter((f) => !isUntracked(f)).map((f) => f.path)
      return void setSkipWorktree(engine, tracked, !node.checked).then(done).catch(fail("skip worktree"))
    }
    case "ctx-assume-unchanged": {
      const tracked = files.filter((f) => !isUntracked(f)).map((f) => f.path)
      return void setAssumeUnchanged(engine, tracked, !node.checked).then(done).catch(fail("assume unchanged"))
    }
    case "ctx-stop-tracking":
      return setPending({ kind: "untrack", path: one })
    case "ctx-file-history":
      return actions.onFileHistory?.(one)
  }
}
