import { useCallback, useRef, useState } from "react"
import { report } from "../diagnostics"
import { describeThrown, type EngineClient, type GitJob, type JobStarted } from "../engine"
import type { SessionEvent } from "../session/state"
import { focusGrid } from "./focusGrid"

export type JobsDeps = {
  client: EngineClient
  dispatch: (e: SessionEvent) => void
  busy: boolean
  setEngineError: (message: string | null) => void
  refresh: () => Promise<void>
  /** Failure classifier from useEngineSession: returns the message to show. */
  handleFailure: (e: unknown, context: string) => string
}

export type Jobs = ReturnType<typeof useJobs>

/** A network operation as the UI remembers it for the session (v0.13.12):
 *  the engine's job record plus the label and a way to run it again. */
export type JobRecord = {
  key: number
  id: string | null
  label: string
  kind: string
  status: "running" | "completed" | "failed"
  output: string | null
  error: string | null
  command: string | null
  startedAt: string
  finishedAt: string | null
  cancelled: boolean
  /** Re-runs the same operation (kept out of state serialisation). */
  rerun: () => Promise<JobStarted>
}

export type PreviewKind = "pull" | "push" | "push-force"

const MAX_JOB_HISTORY = 30

// The busy indicator and the two ways work runs under it: a sync engine
// call (withBusy) or an engine job polled to completion (runJob). Jobs are
// recorded so the status bar's progress line opens an inspectable operation
// (live/final output, cancel, retry) instead of being an anonymous spinner.
export function useJobs({ client, dispatch, busy, setEngineError, refresh, handleFailure }: JobsDeps) {
  const [jobLabel, setJobLabel] = useState<string | null>(null)
  const [jobs, setJobs] = useState<JobRecord[]>([])
  const [panelOpen, setPanelOpen] = useState(false)
  const [preview, setPreview] = useState<PreviewKind | null>(null)
  const nextKey = useRef(1)
  const activeId = useRef<string | null>(null)

  const patch = useCallback((key: number, delta: Partial<JobRecord>) => {
    setJobs((prev) => prev.map((j) => (j.key === key ? { ...j, ...delta } : j)))
  }, [])

  // Shows the topbar progress indicator around any mutating engine call —
  // sync ops (checkout, reset, rebase, stash) give the same feedback as jobs.
  const withBusy = useCallback(
    async (label: string, fn: () => Promise<void>) => {
      if (busy) return
      dispatch({ type: "job-started", label })
      setJobLabel(label)
      try {
        await fn()
        setEngineError(null)
      } catch (e) {
        // Prefix the operation name: a bare browser/DOMException message is
        // otherwise impossible to trace back to what the user clicked.
        setEngineError(`${label}: ${handleFailure(e, label)}`)
      } finally {
        dispatch({ type: "job-finished" })
        setJobLabel(null)
        focusGrid()
      }
    },
    [busy, dispatch, setEngineError, handleFailure],
  )

  const recordStart = useCallback((label: string, start: () => Promise<JobStarted>): number => {
    const key = nextKey.current++
    const rec: JobRecord = {
      key,
      id: null,
      label,
      kind: "",
      status: "running",
      output: null,
      error: null,
      command: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      cancelled: false,
      rerun: start,
    }
    setJobs((prev) => [rec, ...prev].slice(0, MAX_JOB_HISTORY))
    return key
  }, [])

  const runOne = useCallback(
    async (label: string, start: () => Promise<JobStarted>) => {
      const key = recordStart(label, start)
      let started: JobStarted
      try {
        started = await start()
      } catch (e) {
        const msg = describeThrown(e)
        patch(key, { status: "failed", error: msg, finishedAt: new Date().toISOString() })
        throw e
      }
      activeId.current = started.id
      patch(key, { id: started.id, kind: started.kind })
      const onTick = (job: GitJob) =>
        patch(key, {
          output: job.output,
          error: job.error,
          command: job.command,
          cancelled: job.cancelled,
        })
      let job: GitJob
      try {
        job = await client.waitJob(started.id, onTick)
      } finally {
        activeId.current = null
      }
      patch(key, {
        status: job.status,
        output: job.output,
        error: job.error,
        command: job.command,
        finishedAt: job.finishedAt ?? new Date().toISOString(),
        cancelled: job.cancelled,
      })
      if (job.status === "failed") {
        report("warn", "job", `${label}: ${job.error ?? "failed"}`)
        throw new Error(job.error ?? `${label} failed`)
      }
    },
    [client, recordStart, patch],
  )

  // The engine runs one network job at a time per repository (write gate),
  // so a multi-remote fetch must run sequentially, never Promise.all.
  const runJobSequence = useCallback(
    async (label: string, starts: Array<() => Promise<JobStarted>>) => {
      await withBusy(label, async () => {
        for (const start of starts) await runOne(label, start)
        await refresh()
      })
    },
    [withBusy, runOne, refresh],
  )

  const runJob = useCallback(
    (label: string, start: () => Promise<JobStarted>) => runJobSequence(label, [start]),
    [runJobSequence],
  )

  /** Cancels the job in flight (the engine kills its git process). */
  const cancelActive = useCallback(async () => {
    const id = activeId.current
    if (!id) return false
    try {
      return await client.cancelJob(id)
    } catch (e) {
      report("warn", "job", `cancel failed: ${describeThrown(e)}`)
      return false
    }
  }, [client])

  const retryJob = useCallback((rec: JobRecord) => runJob(rec.label, rec.rerun), [runJob])

  const clearJobs = useCallback(() => setJobs((prev) => prev.filter((j) => j.status === "running")), [])

  const openPreview = useCallback((kind: PreviewKind) => setPreview(kind), [])
  const closePreview = useCallback(() => setPreview(null), [])

  return {
    busy,
    jobLabel,
    jobs,
    withBusy,
    runJob,
    runJobSequence,
    cancelActive,
    retryJob,
    clearJobs,
    panelOpen,
    setPanelOpen,
    preview,
    openPreview,
    closePreview,
  }
}
