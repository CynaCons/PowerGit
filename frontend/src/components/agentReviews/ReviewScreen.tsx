import ArrowBackIcon from "@mui/icons-material/ArrowBack"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import IconButton from "@mui/material/IconButton"
import Typography from "@mui/material/Typography"
import { useCallback, useEffect, useMemo, useState } from "react"
import { describeThrown, type AgentReview, type DiffOptions, type EngineClient } from "../../engine"
import { askAgentReview, resolveAgentReview, sendAgentReviewRound } from "../../engine/agentReviews"
import { DEFAULT_DIFF_OPTIONS } from "../../engine/commitCache"
import { useAgentReviewBoard } from "../../hooks/useAgentReviewBoard"
import { useReview } from "../../hooks/useReview"
import { useRoundSource } from "../../hooks/useRoundSource"
import { updateReviewDoc, useReviewDoc } from "../../review/reviewState"
import { withComment, withLine, type LineState } from "../../review/reviewModel"
import { deskGap, paneSx } from "../../theme/panels"
import { DiffOptionsBar } from "../DiffOptionsBar"
import { BoardColumn } from "./BoardColumn"
import type { RoundActions } from "./RoundBox"
import { Chip } from "./reviewChips"
import { RoundDiff } from "./RoundDiff"
import type { CommentKind } from "./RoundThread"
import { hunksOf, latestRound, liveVerdict, roundCounts, roundKey, turnLabel } from "./roundModel"

// One agent review in full view (v0.21.3, layout A of
// docs/prototypes/agent-review-v3.html, picked by the owner on 2026-10-13:
// "I'm okay for A. This is very good."): the top bar, the round's files, the
// diff with a verdict on each change, and the review's board with the round
// box. Keys: A accept, R reject, C comment, J / K next / previous change,
// Ctrl+Enter sends the round.

export function ReviewScreen({
  engine,
  session,
  reload,
  onBack,
  onChanged,
}: {
  engine: EngineClient
  session: AgentReview
  reload: () => Promise<void>
  onBack: () => void
  /** The inbox list re-reads after a send, approve or cancel. */
  onChanged: () => void
}) {
  const latest = latestRound(session)!
  const [viewRound, setViewRound] = useState<number | null>(null)
  const round = session.rounds?.find((r) => r.n === viewRound) ?? latest
  const key = roundKey(session.id, round.n)
  const { finish } = useReview({ engine, key })
  const doc = useReviewDoc(key)
  const threads = useMemo(() => session.comments ?? [], [session.comments])
  const { board, post } = useAgentReviewBoard(engine, session.board ? session.id : null, () => void reload())
  const [path, setPath] = useState<string | null>(round.files[0]?.path ?? null)
  const [picked, setPicked] = useState<{ path: string; key: string } | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const open = session.status === "pending"
  const editable = open && round.n === latest.n && round.sentAt === null
  const canAsk = open && round.n === latest.n && board.available && Boolean(session.board)
  const filePath = round.files.some((f) => f.path === path) ? path! : (round.files[0]?.path ?? "")
  const counts = roundCounts(round, doc, threads)
  const previous = session.rounds?.find((r) => r.n === round.n - 1)?.changes ?? []
  // v0.21.8: the bottom diff's options; whitespace stays as captured.
  const [diffOptions, setDiffOptions] = useState<DiffOptions>(DEFAULT_DIFF_OPTIONS)
  const source = useRoundSource(
    engine,
    session,
    round.files.find((f) => f.path === filePath),
    round.n,
  )

  // Every change of the round in reading order, for J / K and the cursor.
  const order = useMemo(
    () =>
      round.files.flatMap((f) =>
        hunksOf(
          f.patch,
          round.changes.filter((c) => c.path === f.path),
        ).map((h) => ({ path: f.path, hunk: h })),
      ),
    [round],
  )

  const run = useCallback(
    async (work: () => Promise<unknown>) => {
      setBusy(true)
      setError(null)
      try {
        await work()
        await reload()
        onChanged()
      } catch (e) {
        setError(describeThrown(e))
      } finally {
        setBusy(false)
      }
    },
    [onChanged, reload],
  )
  const actions: RoundActions = {
    send: (note) =>
      run(async () => {
        await finish()
        await sendAgentReviewRound(engine, session.id, note.trim() || null)
      }),
    approve: (note) =>
      run(async () => {
        await finish()
        await resolveAgentReview(engine, session.id, "approve", note.trim() || undefined)
      }),
    cancel: () => run(() => resolveAgentReview(engine, session.id, "cancel")),
    ack: () => run(() => resolveAgentReview(engine, session.id, "ack")),
  }
  const setVerdict = useCallback(
    (forPath: string, keys: string[], state: LineState | undefined) =>
      updateReviewDoc(key, (d) => keys.reduce((acc, k) => withLine(acc, forPath, k, state), d)),
    [key],
  )
  const comment = (lineKey: string, text: string, kind: CommentKind) => {
    updateReviewDoc(key, (d) => withComment(d, filePath, lineKey, text))
    setPicked(null)
    if (kind === "ask")
      void run(async () => {
        await finish()
        await askAgentReview(engine, session.id, { round: round.n, path: filePath, line: lineKey, body: text })
      })
  }
  const jump = (commentId: string) => {
    const thread = threads.find((t) => t.id === commentId)
    if (!thread) return
    setViewRound(thread.round === latest.n ? null : thread.round)
    setPath(thread.path)
    if (thread.change) setCursor(thread.change)
    window.setTimeout(() => {
      document
        .querySelector(
          `[data-testid="round-diff"][data-path="${CSS.escape(thread.path)}"] [data-testid="round-line"][data-key="${CSS.escape(thread.line)}"]`,
        )
        ?.scrollIntoView({ block: "center" })
    }, 50)
  }
  const moveCursor = (step: number) => {
    if (order.length === 0) return
    const at = order.findIndex((o) => o.hunk.change?.id === cursor)
    const next = order[Math.min(order.length - 1, Math.max(0, at < 0 ? 0 : at + step))]
    setCursor(next.hunk.change?.id ?? null)
    setPath(next.path)
    window.setTimeout(
      () =>
        document
          .querySelector(`[data-testid="round-change"][data-change="${next.hunk.change?.id ?? ""}"]`)
          ?.scrollIntoView({ block: "nearest" }),
      30,
    )
  }

  // Keys, while no text box has the focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT" || target.isContentEditable)) return
      if (e.key === "Escape") {
        if (picked) setPicked(null)
        else onBack()
        return
      }
      if (e.ctrlKey && e.key === "Enter" && editable) {
        e.preventDefault()
        void (counts.accept === counts.total ? actions.approve("") : actions.send(""))
        return
      }
      if (e.ctrlKey || e.altKey || e.metaKey) return
      const k = e.key.toLowerCase()
      if (k === "j") moveCursor(1)
      else if (k === "k") moveCursor(-1)
      else if ((k === "a" || k === "r" || k === "c") && editable) {
        const current = order.find((o) => o.hunk.change?.id === cursor) ?? order[0]
        if (!current) return
        setCursor(current.hunk.change?.id ?? null)
        if (k === "c") {
          setPath(current.path)
          setPicked({ path: current.path, key: current.hunk.keys[0] })
          return
        }
        const verdict = liveVerdict(round, current.hunk, current.path, doc)
        const target = k === "a" ? "accept" : "reject"
        setVerdict(
          current.path,
          current.hunk.keys,
          verdict === target ? undefined : target === "accept" ? "ok" : "rejected",
        )
        if (verdict !== target) moveCursor(1)
      } else return
      e.preventDefault()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  const turn = turnLabel({ ...session, round: latest.n, turn: !open ? null : latest.sentAt ? "agent" : "user" })
  const where = session.worktree
    ? "working tree"
    : [session.base?.slice(0, 8), session.head?.slice(0, 8)].filter(Boolean).join("..")
  return (
    <Box
      data-testid="agent-review-screen"
      data-round={round.n}
      sx={{
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        gap: deskGap,
        containerType: "inline-size",
      }}
    >
      <Box sx={{ ...paneSx, px: 1.5, py: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
          <IconButton
            size="small"
            aria-label="Back to the agent reviews"
            data-testid="agent-review-back"
            onClick={onBack}
          >
            <ArrowBackIcon fontSize="small" />
          </IconButton>
          <Typography sx={{ fontWeight: 600 }}>{session.title}</Typography>
          <Chip tone={turn.tone === "ok" ? "accept" : turn.tone}>
            <span data-testid="agent-review-turn">
              {session.mode === "wait" ? "Wait" : "Notify"} · {turn.label}
            </span>
          </Chip>
          <Box sx={{ flex: 1 }} />
          {(session.rounds ?? []).length > 1 &&
            (session.rounds ?? []).map((r) => (
              <Button
                key={r.n}
                size="small"
                data-testid="round-tab"
                variant={r.n === round.n ? "contained" : "outlined"}
                onClick={() => setViewRound(r.n === latest.n ? null : r.n)}
                sx={{ textTransform: "none", py: 0, minWidth: 0 }}
              >
                Round {r.n}
              </Button>
            ))}
        </Box>
        <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 0.25 }}>
          {[session.agent, session.branch, where].filter(Boolean).join(" · ")}
        </Typography>
        {session.why && <Typography sx={{ fontSize: 13, mt: 0.25 }}>{session.why}</Typography>}
        {round.note && round.n > 1 && (
          <Typography sx={{ fontSize: 13, mt: 0.25, color: "var(--pg-agent)" }}>
            {session.agent ?? "Agent"}: {round.note}
          </Typography>
        )}
        {error && (
          <Typography data-testid="agent-review-error" color="error" sx={{ fontSize: 12, mt: 0.5 }}>
            {error}
          </Typography>
        )}
      </Box>
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          gridTemplateColumns: "minmax(140px, 0.7fr) minmax(300px, 2.6fr) minmax(260px, 1.15fr)",
          gridTemplateRows: "minmax(0, 1fr)",
          gridTemplateAreas: '"files diff board"',
          gap: deskGap,
          // Narrow (150 % zoom, a small window): the files become a strip over the diff.
          "@container (max-width: 900px)": {
            gridTemplateColumns: "minmax(0, 1fr) minmax(240px, 300px)",
            gridTemplateRows: "auto minmax(0, 1fr)",
            gridTemplateAreas: '"files board" "diff board"',
          },
        }}
      >
        <Box
          sx={{ ...paneSx, overflow: "auto", gridArea: "files", "@container (max-width: 900px)": { maxHeight: 112 } }}
        >
          <Typography sx={{ fontSize: 12, color: "text.secondary", px: 1.25, py: 1 }}>
            Files · round {round.n}
          </Typography>
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
        </Box>
        <Box sx={{ ...paneSx, position: "relative", minHeight: 0, minWidth: 0, display: "flex", gridArea: "diff" }}>
          <Box data-testid="round-diff-scroll" sx={{ flex: 1, minWidth: 0, overflow: "auto", p: 1.25, pb: 6 }}>
            <RoundDiff
              round={round}
              path={filePath}
              doc={doc}
              threads={threads}
              editable={editable}
              canAsk={canAsk}
              previous={previous}
              cursor={cursor}
              picked={picked}
              onPick={(lineKey) => setPicked(lineKey ? { path: filePath, key: lineKey } : null)}
              onVerdict={(keys, state) => setVerdict(filePath, keys, state)}
              onMark={(lineKey, state) => setVerdict(filePath, [lineKey], state)}
              onComment={comment}
              onCursor={setCursor}
              options={diffOptions}
              sourceText={source.text}
              sourceSettled={source.settled}
            />
            {editable && (
              <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 1 }}>
                A accept · R reject · C comment · J / K next / previous change · a click on a line number comments on
                that line · Ctrl+Enter sends the round
              </Typography>
            )}
          </Box>
          <DiffOptionsBar options={diffOptions} onChange={setDiffOptions} noWhitespace />
        </Box>
        <Box sx={{ ...paneSx, minHeight: 0, minWidth: 0, gridArea: "board" }}>
          <BoardColumn
            session={session}
            round={round}
            counts={counts}
            board={board}
            onPost={post}
            onJump={jump}
            actions={actions}
            busy={busy}
          />
        </Box>
      </Box>
    </Box>
  )
}
