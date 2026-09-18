import ArrowBackIcon from "@mui/icons-material/ArrowBack"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import IconButton from "@mui/material/IconButton"
import Typography from "@mui/material/Typography"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { AgentReview, DiffDto, EngineClient, FileChange } from "../../engine"
import { agentReviewDiff, resolveAgentReview } from "../../engine/agentReviews"
import { DEFAULT_DIFF_OPTIONS } from "../../engine/commitCache"
import { describeThrown, isAbort } from "../../engine"
import { rowKeysOf } from "../../hooks/useDiffReview"
import { useReview } from "../../hooks/useReview"
import { setReviewMode } from "../../review/reviewState"
import { DiffTab } from "../DiffTab"
import type { Loadable } from "../loadable"
import { ReviewBar } from "../ReviewBar"
import { ConfirmDialog } from "../dialogs/ConfirmDialog"
import { ModeChip, StatusChip } from "./AgentReviewList"
import { RequestChangesDialog } from "./RequestChangesDialog"

export function AgentReviewSession({
  session,
  engine,
  onBack,
  onResolved,
}: {
  session: AgentReview
  engine: EngineClient
  onBack: () => void
  onResolved: () => void
}) {
  const files = useMemo<FileChange[]>(
    () => session.files.map((f) => ({ path: f.path, status: f.status, binary: false })),
    [session.files],
  )
  const [selectedPath, setSelectedPath] = useState(files[0]?.path ?? null)
  const [diff, setDiff] = useState<Loadable<DiffDto>>({ kind: "idle" })
  const [width, setWidth] = useState(240)
  const host = useRef<HTMLDivElement | null>(null)
  const [requesting, setRequesting] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const { startOver, finish } = useReview({ engine, key: session.id })
  useEffect(() => setReviewMode(true), [])
  const load = useCallback(() => {
    if (!selectedPath) return () => undefined
    const ctrl = new AbortController()
    setDiff({ kind: "loading" })
    void agentReviewDiff(engine, session.id, selectedPath, ctrl.signal)
      .then((value) => !ctrl.signal.aborted && setDiff({ kind: "ready", value }))
      .catch(
        (e: unknown) => !ctrl.signal.aborted && !isAbort(e) && setDiff({ kind: "error", message: describeThrown(e) }),
      )
    return () => ctrl.abort()
  }, [engine, selectedPath, session.id])
  useEffect(load, [load])
  const resolve = async (action: "approve" | "request_changes" | "cancel" | "ack", summary?: string) => {
    await resolveAgentReview(engine, session.id, action, summary)
    onResolved()
  }
  const rowKeys = useMemo(() => rowKeysOf(diff.kind === "ready" ? diff.value.text : ""), [diff])
  const exportDiffs = useCallback(async () => {
    const values = await Promise.all(
      session.files.map(async (f) => [f.path, (await agentReviewDiff(engine, session.id, f.path)).text] as const),
    )
    return new Map(values)
  }, [engine, session.files, session.id])
  const pending = session.status === "pending"
  const ref = session.worktree
    ? "working tree"
    : [session.base?.slice(0, 8), session.head?.slice(0, 8)].filter(Boolean).join("..")
  return (
    <Box ref={host} sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <Box sx={{ p: 1, borderBottom: 1, borderColor: "divider" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <IconButton size="small" onClick={onBack}>
            <ArrowBackIcon />
          </IconButton>
          <Typography sx={{ fontWeight: 600, flex: 1 }}>{session.title}</Typography>
          <ModeChip mode={session.mode} />
          <StatusChip status={session.status} />
        </Box>
        <Typography variant="caption" color="text.secondary">
          {[session.agent, session.branch, ref].filter(Boolean).join(" · ")}
        </Typography>
        <Typography data-testid="agent-review-why" sx={{ mt: 0.5 }}>
          {session.why}
        </Typography>
        <Box data-testid="agent-review-actions" sx={{ display: "flex", gap: 1, mt: 1 }}>
          <Button
            data-testid="agent-review-approve"
            variant="contained"
            disabled={!pending}
            onClick={() => void resolve("approve")}
          >
            Approve
          </Button>
          <Button
            data-testid="agent-review-request-changes"
            variant="outlined"
            disabled={!pending}
            onClick={() => setRequesting(true)}
          >
            Request changes
          </Button>
          <Button data-testid="agent-review-cancel" disabled={!pending} onClick={() => setCancelling(true)}>
            Cancel
          </Button>
          {session.mode === "notify" && session.unread && (
            <Button data-testid="agent-review-ack" onClick={() => void resolve("ack")}>
              Mark read
            </Button>
          )}
        </Box>
      </Box>
      <Box sx={{ display: "flex", flex: 1, minHeight: 0 }}>
        <DiffTab
          files={files}
          selectedPath={selectedPath}
          onSelect={setSelectedPath}
          treeMode={false}
          onToggleTreeMode={() => undefined}
          filesWidth={width}
          splitHandleProps={{
            testid: "agent-review-splitter",
            value: width,
            defaultValue: 240,
            min: 140,
            maxRatio: 0.5,
            getContainerWidth: () => host.current?.clientWidth ?? 800,
            onChange: setWidth,
            onCommit: setWidth,
          }}
          diff={diff}
          busy={false}
          options={DEFAULT_DIFF_OPTIONS}
          onOptions={() => undefined}
          onRetry={() => load()}
          onOpenDifftool={() => undefined}
          difftoolError={null}
          row={null}
          commitId={null}
          reviewKey={session.id}
          rowKeys={rowKeys}
        />
      </Box>
      <Box sx={{ display: "flex", minHeight: 42, borderTop: 1, borderColor: "divider" }}>
        <ReviewBar
          reviewKey={session.id}
          path={selectedPath}
          rowKeys={rowKeys}
          startOver={startOver}
          finish={finish}
          exportDiffs={exportDiffs}
        />
      </Box>
      <RequestChangesDialog
        open={requesting}
        onClose={() => setRequesting(false)}
        onSend={(summary) => void resolve("request_changes", summary)}
      />
      <ConfirmDialog
        open={cancelling}
        testid="agent-review-cancel-confirm"
        title="Cancel this review?"
        text="The agent is told to stop."
        confirmLabel="Cancel review"
        destructive
        onCancel={() => setCancelling(false)}
        onConfirm={() => void resolve("cancel")}
      />
    </Box>
  )
}
