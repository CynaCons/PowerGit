import { useEngine, type RepoStatus } from "../engine"
import { excludeFiles, moveFile, openFile, untrackFiles } from "../engine/files"
import { ConfirmDialog } from "./dialogs/ConfirmDialog"
import { CommitFilePromptDialog } from "./CommitFilePromptDialog"
import { IgnoreDialog } from "./IgnoreDialog"
import type { FilePending } from "./commitFileMenuActions"
import { excludePattern } from "./commitFileMenuModel"
import { rememberOpenWith, rememberedOpenWith } from "./commitFileMenuState"

/**
 * The confirmations and prompts behind the file menu's new items (v0.16.0),
 * rendered next to the menu so they need nothing from CommitDialog.tsx:
 * reset-to-index, exclude (GE FormAddToGitIgnore with localExclude — the
 * IgnoreDialog in its exclude mode for one file, a plain confirmation for
 * several), stop tracking, "Open with…" and "Rename / move…".
 */
export function CommitFileMenuDialogs({
  pending,
  onClose,
  onStatus,
  onError,
}: {
  pending: FilePending | null
  onClose: () => void
  onStatus: (status: RepoStatus) => void
  onError: (what: string) => (e: unknown) => void
}) {
  const engine = useEngine()
  const one = (n: number, path: string) => (n === 1 ? path : `${n} files`)
  const finish = (what: string) => (p: Promise<RepoStatus>) => {
    onClose()
    void p.then(onStatus).catch(onError(what))
  }

  return (
    <>
      <ConfirmDialog
        open={pending?.kind === "reset-index"}
        testid="reset-index-confirm"
        title="Reset unstaged changes"
        text={`Discard the unstaged changes in ${pending?.kind === "reset-index" ? one(pending.paths.length, pending.paths[0]) : ""}?\n\nEach file goes back to the version in the index, so anything already staged is kept; a new file is deleted. This cannot be undone.`}
        confirmLabel="Reset"
        destructive
        onConfirm={() => {
          if (pending?.kind === "reset-index") finish("reset")(engine.resetFiles(pending.paths, "worktree"))
        }}
        onCancel={onClose}
      />
      <ConfirmDialog
        open={pending?.kind === "exclude-many"}
        testid="exclude-files-confirm"
        title="Add to .git/info/exclude"
        text={`Ignore ${pending?.kind === "exclude-many" ? pending.paths.length : 0} files in this clone only?\n\n${pending?.kind === "exclude-many" ? pending.paths.map(excludePattern).join("\n") : ""}`}
        confirmLabel="Add"
        onConfirm={() => {
          if (pending?.kind === "exclude-many")
            finish("exclude")(excludeFiles(engine, pending.paths.map(excludePattern)))
        }}
        onCancel={onClose}
      />
      <ConfirmDialog
        open={pending?.kind === "untrack"}
        testid="untrack-file-confirm"
        title="Stop tracking this file"
        text={`Remove ${pending?.kind === "untrack" ? pending.path : ""} from the index and stop tracking it?\n\nThe file stays on disk; the removal is staged for the next commit.`}
        confirmLabel="Stop tracking"
        destructive
        onConfirm={() => {
          if (pending?.kind === "untrack") finish("stop tracking")(untrackFiles(engine, [pending.path]))
        }}
        onCancel={onClose}
      />
      {pending?.kind === "exclude-one" && (
        <IgnoreDialog
          open
          target="exclude"
          initialPattern={excludePattern(pending.path)}
          onClose={onClose}
          onConfirm={async (pattern) => {
            onStatus(await excludeFiles(engine, [pattern]))
          }}
        />
      )}
      <CommitFilePromptDialog
        open={pending?.kind === "open-with"}
        testid="open-with-dialog"
        title="Open with"
        label="Program"
        initialValue={rememberedOpenWith()}
        placeholder="Path or command, e.g. code"
        confirmLabel="Open"
        browse
        onConfirm={async (program) => {
          if (pending?.kind !== "open-with") return
          await openFile(engine, pending.path, program)
          rememberOpenWith(program)
          onClose()
        }}
        onCancel={onClose}
      />
      <CommitFilePromptDialog
        open={pending?.kind === "rename"}
        testid="rename-file-dialog"
        title="Rename / move"
        label="New name"
        initialValue={pending?.kind === "rename" ? pending.path : ""}
        confirmLabel="Rename"
        onConfirm={async (newPath) => {
          if (pending?.kind !== "rename") return
          onStatus(await moveFile(engine, pending.path, newPath))
          onClose()
        }}
        onCancel={onClose}
      />
    </>
  )
}
