import ArrowBackIcon from "@mui/icons-material/ArrowBack"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import IconButton from "@mui/material/IconButton"
import Typography from "@mui/material/Typography"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { describeThrown, type AgentReview, type AgentReviewThread, type EngineClient } from "../../../engine"
import {
  commentBranchPlanStep,
  recheckBranchPlan,
  replyAgentReviewComment,
  resolveAgentReview,
  sendAgentReviewRound,
} from "../../../engine/agentReviews"
import { useAgentReviewBoard } from "../../../hooks/useAgentReviewBoard"
import { deskGap, paneSx } from "../../../theme/panels"
import { BoardColumn } from "../BoardColumn"
import { ReviewIntro } from "../ReviewIntro"
import { Chip } from "../reviewChips"
import { latestRound, turnLabel } from "../roundModel"
import { PlanBox } from "./PlanBox"
import { PlanDetail } from "./PlanDetail"
import { PlanGraph } from "./PlanGraph"
import { firstStepToRead, planCounts } from "./planModel"
import { useReviewGrid } from "../reviewLayout"
import { DetailSplit } from "./DetailSplit"
import { DETAIL_KEY, HEADER_KEY, readDetailHeight, readHeaderHeight } from "./detailHeight"

// A branch plan in full view (v0.22.0, docs/prototypes/branch-plan-v1.html,
// owner: "This is awesome. Let's bake it in!!!!"): the steps in the order the
// agent will run them, each with its check; the plan on the graph with a
// scrubber from now to after the last step and the selected step's detail
// under it; the board with the plan's box. The screen reads the plan again
// every few seconds while it can change: the repository moving under a
// waiting plan, or an approved plan's steps running.

const POLL_MS = 2500
const resultMark = { ok: "✓", conflict: "!", risk: "!", invalid: "✕", unknown: "?" } as const
const resultColor = {
  ok: "var(--pg-review-accept)",
  conflict: "var(--pg-review-rejected)",
  risk: "var(--pg-review-rejected)",
  invalid: "var(--pg-review-rejected)",
  unknown: "text.secondary",
} as const

export function PlanScreen({
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
  onChanged: () => void
}) {
  const round = latestRound(session)!
  const plan = round.plan!
  const [selected, setSelected] = useState(() => firstStepToRead(plan.steps))
  const [at, setAt] = useState(() => firstStepToRead(plan.steps))
  const [busy, setBusy] = useState(false)
  const grid = useReviewGrid()
  const middle = useRef<HTMLDivElement | null>(null)
  const [detailHeight, setDetailHeight] = useState(readDetailHeight)
  const [headerHeight, setHeaderHeight] = useState(readHeaderHeight)
  const screen = useRef<HTMLDivElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const open = session.status === "pending"
  const editable = open && round.sentAt === null
  const counts = planCounts(plan.steps)
  const running = session.status === "approved" && counts.done < counts.total
  const stale = open && (plan.moved ?? []).length > 0
  const { board, post } = useAgentReviewBoard(engine, session.board ? session.id : null, () => void reload())
  const threads = useMemo(
    () => (session.comments ?? []).filter((t) => t.kind !== "withdrawn" && t.path === "plan"),
    [session.comments],
  )
  const replyOff = !open ? null : board.available && session.board ? null : "Replies need powerchannel."

  // The repository can move under a waiting plan, and an approved one runs.
  useEffect(() => {
    if (!open && !running) return
    const t = window.setInterval(() => void reload(), POLL_MS)
    return () => window.clearInterval(t)
  }, [open, running, reload])

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
  const pick = (n: number) => {
    setSelected(n)
    setAt(n)
  }
  const jump = (commentId: string) => {
    const t = threads.find((x) => x.id === commentId)
    const n = t ? Number(t.line.slice(1)) : NaN
    if (Number.isFinite(n)) pick(n)
  }
  const step = plan.steps.find((s) => s.n === selected) ?? plan.steps[0]
  const turn = turnLabel({ ...session, round: round.n, turn: !open ? null : round.sentAt ? "agent" : "user" })

  // Keys, while no text box has the focus: ← → move the scrubber, J / K the step.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT" || target.isContentEditable)) return
      if (e.ctrlKey || e.altKey || e.metaKey) return
      if (e.key === "Escape") onBack()
      else if (e.key === "ArrowRight") setAt((a) => Math.min(plan.steps.length, a + 1))
      else if (e.key === "ArrowLeft") setAt((a) => Math.max(0, a - 1))
      else if (e.key.toLowerCase() === "j") pick(Math.min(plan.steps.length, selected + 1))
      else if (e.key.toLowerCase() === "k") pick(Math.max(1, selected - 1))
      else return
      e.preventDefault()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  return (
    <Box
      ref={screen}
      data-testid="plan-screen"
      data-round={round.n}
      data-at={at}
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
      <Box
        data-testid="plan-header"
        // v0.22.3, owner: "you didnt make the top panel resizeable": a long why
        // scrolls inside the panel, whose height its handle sets.
        sx={{ ...paneSx, px: 1.5, py: 1, height: headerHeight, overflow: "auto", flexShrink: 0 }}
      >
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
          <Chip tone="agent">branch plan</Chip>
          <Chip tone={turn.tone === "ok" ? "accept" : turn.tone}>
            <span data-testid="agent-review-turn">
              {session.mode === "wait" ? "Wait" : "Notify"} · {turn.label}
            </span>
          </Chip>
          {counts.conflict > 0 && open && (
            <Chip tone="reject">
              {counts.conflict} conflict risk{counts.conflict === 1 ? "" : "s"}
            </Chip>
          )}
        </Box>
        <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 0.25 }}>
          {[session.agent, `round ${round.n}`, `checked ${new Date(plan.checkedAt).toLocaleTimeString()}`]
            .filter(Boolean)
            .join(" · ")}
        </Typography>
        <ReviewIntro why={session.why} note={round.n > 1 ? round.note : null} agent={session.agent} />
        {stale && (
          <Box
            data-testid="plan-stale"
            sx={{
              mt: 0.75,
              px: 1.25,
              py: 0.75,
              borderRadius: 1,
              display: "flex",
              alignItems: "center",
              gap: 1,
              bgcolor: "var(--pg-review-todo-bg)",
              color: "var(--pg-review-todo)",
              fontSize: 12.5,
            }}
          >
            <span>{(plan.moved ?? []).join(", ")} moved since the plan was checked.</span>
            <Box sx={{ flex: 1 }} />
            <Button
              size="small"
              variant="outlined"
              data-testid="plan-recheck"
              disabled={busy}
              onClick={() => void run(() => recheckBranchPlan(engine, session.id))}
              sx={{ textTransform: "none", py: 0 }}
            >
              Check again
            </Button>
          </Box>
        )}
        {error && (
          <Typography data-testid="agent-review-error" color="error" sx={{ fontSize: 12, mt: 0.5 }}>
            {error}
          </Typography>
        )}
      </Box>
      <Box sx={{ mt: `calc(-1 * ${deskGap})`, mb: `calc(-1 * ${deskGap})` }}>
        <DetailSplit
          height={headerHeight}
          onHeight={setHeaderHeight}
          grow="down"
          getMax={() => (screen.current?.clientHeight ?? 800) - 260}
          storageKey={HEADER_KEY}
          label="Resize the top panel"
          testid="plan-header-splitter"
        />
      </Box>
      <Box
        // v0.22.2, owner: "Make the panels resizeable in the branch plan": the
        // steps and the board take the review's widths and handles.
        ref={grid.ref}
        style={grid.style}
        sx={{
          position: "relative",
          flex: 1,
          minHeight: 0,
          display: "grid",
          gridTemplateColumns: "var(--rv-files, 220px) minmax(320px, 1fr) var(--rv-board, 340px)",
          gridTemplateRows: "minmax(0, 1fr)",
          gap: deskGap,
          "@container (max-width: 980px)": {
            gridTemplateColumns: "220px minmax(0, 1fr)",
            "& > :last-child": { display: "none" },
          },
        }}
      >
        {grid.handles}
        <Box data-testid="plan-steps" sx={{ ...paneSx, minWidth: 0, overflow: "auto", p: 0.75 }}>
          <Typography sx={{ fontWeight: 600, fontSize: 13, px: 0.75, pt: 0.5, pb: 0.75 }}>
            Steps{" "}
            <Box component="span" sx={{ fontWeight: 400, color: "text.secondary", fontSize: 12 }}>
              in the order the agent runs them
            </Box>
          </Typography>
          {plan.steps.map((s) => {
            const comments = threads.filter((t) => t.line === `s${s.n}`).length
            return (
              <Box
                key={s.n}
                data-testid="plan-step"
                data-n={s.n}
                data-result={s.result}
                data-done={s.done ? "true" : "false"}
                role="button"
                tabIndex={0}
                aria-current={s.n === selected}
                onClick={() => pick(s.n)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    pick(s.n)
                  }
                }}
                sx={{
                  display: "grid",
                  gridTemplateColumns: "22px minmax(0, 1fr)",
                  gap: 1,
                  px: 1,
                  py: 0.9,
                  borderRadius: 1,
                  cursor: "pointer",
                  border: 1,
                  borderColor: s.n === selected ? "var(--pg-grid-sel-border, #2563eb)" : "transparent",
                  bgcolor: s.n === selected ? "var(--pg-grid-sel-bg, rgba(37,99,235,.1))" : "transparent",
                  "&:hover": { bgcolor: s.n === selected ? undefined : "action.hover" },
                  "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main" },
                }}
              >
                <Box
                  sx={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    border: "1.5px solid",
                    borderColor: s.done ? "var(--pg-review-accept)" : "var(--pg-agent)",
                    bgcolor: s.done ? "var(--pg-review-accept)" : "transparent",
                    color: s.done ? "#fff" : "var(--pg-agent)",
                    display: "grid",
                    placeItems: "center",
                    fontSize: 11,
                    fontWeight: 600,
                    mt: "1px",
                  }}
                >
                  {s.done ? "✓" : s.n}
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: 12.5, fontWeight: 500 }}>{s.text}</Typography>
                  <Typography sx={{ fontSize: 12, color: resultColor[s.result] }}>
                    {resultMark[s.result]} {s.because}
                    {comments > 0 && (
                      <Box component="span" sx={{ color: "text.secondary", ml: 0.75 }}>
                        {comments} comment{comments === 1 ? "" : "s"}
                      </Box>
                    )}
                  </Typography>
                </Box>
              </Box>
            )
          })}
        </Box>
        <Box
          ref={middle}
          sx={{ ...paneSx, minWidth: 0, minHeight: 0, display: "grid", gridTemplateRows: "minmax(0, 1fr) auto auto" }}
        >
          <PlanGraph plan={plan} at={at} onAt={setAt} selected={selected} />
          <DetailSplit
            height={detailHeight}
            onHeight={setDetailHeight}
            getMax={() => (middle.current?.clientHeight ?? 600) - 120}
            storageKey={DETAIL_KEY}
            label="Resize the step detail"
            testid="plan-detail-splitter"
          />
          <Box data-testid="plan-detail-pane" sx={{ height: detailHeight, overflow: "auto", bgcolor: "action.hover" }}>
            {step && (
              <PlanDetail
                key={step.n}
                step={step}
                threads={threads.filter((t) => t.line === `s${step.n}`)}
                canComment={editable}
                sent={round.sentAt !== null}
                onComment={(body) => run(() => commentBranchPlanStep(engine, session.id, step.n, body))}
                onReply={
                  open && !replyOff
                    ? (t: AgentReviewThread, body: string) =>
                        void run(() => replyAgentReviewComment(engine, session.id, t.id, body))
                    : null
                }
                replyOff={replyOff}
              />
            )}
          </Box>
        </Box>
        <Box data-testid="review-board-pane" sx={{ ...paneSx, minHeight: 0, minWidth: 0 }}>
          <BoardColumn
            session={session}
            round={round}
            counts={{ accept: 0, reject: 0, mixed: 0, undecided: 0, comments: 0, total: 0 }}
            board={board}
            onPost={post}
            onJump={jump}
            actions={{ send: async () => {}, approve: async () => {}, cancel: async () => {}, ack: async () => {} }}
            busy={busy}
            footer={
              <PlanBox
                session={session}
                round={round}
                busy={busy}
                onSend={(note) => void run(() => sendAgentReviewRound(engine, session.id, note.trim() || null))}
                onApprove={(note) =>
                  void run(() => resolveAgentReview(engine, session.id, "approve", note.trim() || undefined))
                }
                onCancel={() => void run(() => resolveAgentReview(engine, session.id, "cancel"))}
              />
            }
          />
        </Box>
      </Box>
    </Box>
  )
}
