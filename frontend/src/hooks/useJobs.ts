import { useState } from "react"
import { describeThrown, waitJob, type JobStarted } from "../engine"
import { focusGrid } from "./focusGrid"

export type JobsDeps = {
  setEngineError: (message: string | null) => void
  refresh: () => Promise<void>
}

export type Jobs = ReturnType<typeof useJobs>

// The busy indicator and the two ways work runs under it: a sync engine
// call (withBusy) or an engine job polled to completion (runJob).
export function useJobs({ setEngineError, refresh }: JobsDeps) {
  const [busy, setBusy] = useState(false)
  const [jobLabel, setJobLabel] = useState<string | null>(null)

  // Shows the topbar progress indicator around any mutating engine call —
  // sync ops (checkout, reset, rebase, stash) give the same feedback as jobs.
  async function withBusy(label: string, fn: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    setJobLabel(label)
    try {
      await fn()
      setEngineError(null)
    } catch (e) {
      // Prefix the operation name: a bare browser/DOMException message (e.g.
      // WebKit's "The string did not match the expected pattern") is
      // otherwise impossible to trace back to what the user clicked.
      // `describeThrown` (engine.ts) reads `.message` defensively since
      // DOMException does not reliably satisfy `instanceof Error`.
      setEngineError(`${label}: ${describeThrown(e)}`)
    } finally {
      setBusy(false)
      setJobLabel(null)
      focusGrid()
    }
  }

  // The engine runs one network job at a time (single-flight guard), so a
  // multi-remote fetch must run sequentially, never Promise.all.
  async function runJobSequence(label: string, starts: Array<() => Promise<JobStarted>>) {
    await withBusy(label, async () => {
      for (const start of starts) {
        const { id } = await start()
        const job = await waitJob(id)
        if (job.status === "failed") throw new Error(job.error ?? `${label} failed`)
      }
      await refresh()
    })
  }

  async function runJob(label: string, start: () => Promise<JobStarted>) {
    await runJobSequence(label, [start])
  }

  return { busy, jobLabel, withBusy, runJob, runJobSequence }
}
