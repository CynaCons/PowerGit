import type { RepoStatus } from "../engine"

// What the repository is in the middle of, in words (v0.15.0). Kept apart
// from OperationBanner.tsx so the status bar can use the same sentences and
// so both can be unit-tested without rendering.

const short = (sha: string | null | undefined) => (sha ? sha.slice(0, 7) : "")

/** "Rebasing feature onto 1a2b3c4 (step 2 of 5)". */
export function operationHeadline(status: RepoStatus): string {
  const op = status.operation ?? null
  const step = op?.step != null && op?.total != null ? ` (step ${op.step} of ${op.total})` : ""
  switch (status.state) {
    case "merging": {
      // The engine reports the current branch as headName and the incoming
      // side as ontoName (the name of MERGE_HEAD); merging a commit with no
      // ref on it leaves only the sha.
      const incoming = op?.ontoName ?? short(op?.onto)
      const from = incoming ? `'${incoming}'` : "a branch"
      return `Merging ${from} into ${status.branch}`
    }
    case "rebasing": {
      const head = op?.headName ?? status.branch
      const onto = op?.ontoName ?? short(op?.onto)
      return `Rebasing ${head}${onto ? ` onto ${onto}` : ""}${step}`
    }
    case "cherry-picking": {
      const at = short(op?.stoppedSha)
      return `Cherry-picking${at ? ` ${at}` : ""}${step}`
    }
    case "reverting": {
      const at = short(op?.stoppedSha)
      return `Reverting${at ? ` ${at}` : ""}${step}`
    }
    default:
      return ""
  }
}

/** "MERGING" / "REBASING 2/5" for the status bar; null when idle. */
export function operationCaption(status: RepoStatus | null): string | null {
  const state = status?.state ?? "none"
  if (!status || state === "none") return null
  const op = status.operation ?? null
  const step = op?.step != null && op?.total != null ? ` ${op.step}/${op.total}` : ""
  return `${state.toUpperCase()}${step}`
}

/** The sequencer route a state belongs to, or null for a merge/no operation. */
export function sequencerOpOf(status: RepoStatus | null): "rebase" | "cherry-pick" | "revert" | null {
  switch (status?.state) {
    case "rebasing":
      return "rebase"
    case "cherry-picking":
      return "cherry-pick"
    case "reverting":
      return "revert"
    default:
      return null
  }
}
