import Box from "@mui/material/Box"
import Typography from "@mui/material/Typography"
import type { AgentReviewRound } from "../../engine"
import type { ReviewDoc } from "../../review/reviewModel"
import { hunksOf, liveVerdict, type EarlierThreads } from "./roundModel"

// The review's files list (v0.21.3; moved out of ReviewScreen in v0.21.13):
// each file of the round with its decided count and verdict meter, then the
// files that left the round but still hold conversations from earlier rounds
// (owner: "if I drop a comment on round one, when the agent comes with round
// two, I lose the comments"), greyed, with their conversation count.

export function ReviewFiles({
  round,
  doc,
  current,
  onPick,
  left,
  earlier,
}: {
  round: AgentReviewRound
  doc: ReviewDoc | null
  current: string
  onPick: (path: string) => void
  left: string[]
  earlier: EarlierThreads
}) {
  const filePath = current
  const setPath = onPick
  return (
    <>
      <Typography sx={{ fontSize: 12, color: "text.secondary", px: 1.25, py: 1 }}>Files · round {round.n}</Typography>
      {round.files.map((f) => {
        const hunks = hunksOf(
          f.patch,
          round.changes.filter((c) => c.path === f.path),
        )
        const verdicts = hunks.map((h) => liveVerdict(round, h, f.path, doc))
        const ok = verdicts.filter((v) => v === "accept").length
        const no = verdicts.filter((v) => v === "reject" || v === "mixed").length
        const pct = (n: number) => (hunks.length ? (100 * n) / hunks.length : 0)
        return (
          <Box
            key={f.path}
            component="button"
            data-testid="round-file"
            data-path={f.path}
            aria-current={f.path === filePath}
            onClick={() => setPath(f.path)}
            sx={{
              display: "block",
              width: "100%",
              textAlign: "left",
              border: 0,
              borderBottom: 1,
              borderColor: "divider",
              bgcolor: f.path === filePath ? "var(--pg-grid-sel)" : "transparent",
              color: "text.primary",
              px: 1.25,
              py: 0.75,
              cursor: "pointer",
            }}
          >
            <Box sx={{ display: "flex", gap: 1 }}>
              <Typography
                noWrap
                sx={{ fontFamily: "var(--pg-font-mono, monospace)", fontSize: 12, flex: 1, minWidth: 0 }}
              >
                {f.path.split("/").pop()}
              </Typography>
              <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                {ok + no}/{hunks.length}
              </Typography>
            </Box>
            <Typography noWrap sx={{ fontSize: 11, color: "text.secondary" }}>
              {f.path}
            </Typography>
            <Box
              sx={{
                height: 5,
                borderRadius: 3,
                bgcolor: "action.hover",
                display: "flex",
                overflow: "hidden",
                mt: 0.5,
              }}
            >
              <Box sx={{ width: `${pct(ok)}%`, bgcolor: "var(--pg-review-accept)" }} />
              <Box sx={{ width: `${pct(no)}%`, bgcolor: "var(--pg-review-rejected)" }} />
            </Box>
          </Box>
        )
      })}
      {left.map((path) => {
        const n =
          (earlier.byFile.get(path)?.length ?? 0) +
          earlier.removed.filter((e) => e.change.path === path).reduce((sum, e) => sum + e.threads.length, 0)
        return (
          <Box
            key={path}
            component="button"
            data-testid="round-file"
            data-path={path}
            data-left="true"
            aria-current={path === filePath}
            onClick={() => setPath(path)}
            sx={{
              display: "block",
              width: "100%",
              textAlign: "left",
              border: 0,
              borderBottom: 1,
              borderColor: "divider",
              bgcolor: path === filePath ? "var(--pg-grid-sel)" : "transparent",
              color: "text.secondary",
              px: 1.25,
              py: 0.75,
              cursor: "pointer",
            }}
          >
            <Typography noWrap sx={{ fontFamily: "var(--pg-font-mono, monospace)", fontSize: 12 }}>
              {path.split("/").pop()}
            </Typography>
            <Typography noWrap sx={{ fontSize: 11 }}>
              Not in round {round.n} · {n} conversation{n === 1 ? "" : "s"}
            </Typography>
          </Box>
        )
      })}
    </>
  )
}
