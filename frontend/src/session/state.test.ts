import { describe, expect, it } from "vitest"
import type { Health, RepoInfo } from "../engine/types"
import {
  MAX_RECOVERY_ATTEMPTS,
  initialSession,
  sessionReducer,
  sessionView,
  type SessionEvent,
  type SessionPhase,
} from "./state"

const health: Health = { engine: "0.0.0", status: "ok", gitPath: "git", gitVersion: "git version 2" }
const repo: RepoInfo = { id: "abc123abc123", name: "r", root: "/r", branch: "main" }

const run = (events: SessionEvent[], from: SessionPhase = initialSession) => events.reduce(sessionReducer, from)

describe("session state machine", () => {
  it("boots through health into no-repository, then ready on open", () => {
    const s1 = run([{ type: "health-ok", health }])
    expect(s1.phase).toBe("no-repository")
    const s2 = run([{ type: "repo-opened", repo }], s1)
    expect(s2).toEqual({ phase: "ready", health, repo })
    expect(sessionView(s2).live).toBe(true)
    expect(sessionView(s2).offline).toBe(false)
  })

  it("never becomes ready without a healthy engine", () => {
    expect(run([{ type: "repo-opened", repo }]).phase).toBe("starting")
    expect(
      run([{ type: "repo-opened", repo }], { phase: "engine-failed", reason: "x", repo: null, log: null }).phase,
    ).toBe("engine-failed")
  })

  it("demo is explicit and sticky, never a fallback for a failed engine", () => {
    const failed = run(
      Array.from({ length: MAX_RECOVERY_ATTEMPTS }, () => ({ type: "health-failed", reason: "down" }) as SessionEvent),
    )
    expect(failed.phase).toBe("engine-failed")
    expect(sessionView(failed).demo).toBe(false)
    expect(sessionView(failed).live).toBe(false)

    const demo = run([
      { type: "demo" },
      { type: "health-failed", reason: "down" },
      { type: "engine-exited", reason: "x", log: null },
    ])
    expect(demo.phase).toBe("demo")
    expect(sessionView(demo).demo).toBe(true)
  })

  it("keeps retrying at startup before giving up", () => {
    const s = run([
      { type: "health-failed", reason: "a" },
      { type: "health-failed", reason: "b" },
    ])
    expect(s).toEqual({ phase: "starting", attempt: 2 })
    expect(sessionView(s).booting).toBe(true)
  })

  it("busy is only reachable from ready and returns to ready", () => {
    const ready = run([
      { type: "health-ok", health },
      { type: "repo-opened", repo },
    ])
    const busy = sessionReducer(ready, { type: "job-started", label: "Pulling" })
    expect(busy).toEqual({ phase: "busy", health, repo, label: "Pulling" })
    expect(sessionView(busy).busyLabel).toBe("Pulling")
    expect(sessionReducer(busy, { type: "job-finished" })).toEqual(ready)
    expect(sessionReducer(run([{ type: "health-ok", health }]), { type: "job-started", label: "x" }).phase).toBe(
      "no-repository",
    )
  })

  it("losing the engine while ready recovers back to ready with the same repo", () => {
    const ready = run([
      { type: "health-ok", health },
      { type: "repo-opened", repo },
    ])
    const rec = sessionReducer(ready, { type: "engine-lost", reason: "ECONNREFUSED" })
    expect(rec.phase).toBe("recovering")
    expect(sessionView(rec).offline).toBe(true)
    expect(sessionView(rec).repo).toEqual(repo) // last valid repo stays visible
    expect(sessionView(rec).primaryAction).toBe("retry")
    const back = sessionReducer(rec, { type: "health-ok", health })
    expect(back).toEqual({ phase: "ready", health, repo })
  })

  it("gives up after MAX_RECOVERY_ATTEMPTS and retry re-arms recovery", () => {
    const ready = run([
      { type: "health-ok", health },
      { type: "repo-opened", repo },
    ])
    let s = sessionReducer(ready, { type: "engine-lost", reason: "x" })
    for (let i = 0; i < MAX_RECOVERY_ATTEMPTS; i++)
      s = sessionReducer(s, { type: "health-failed", reason: "still down" })
    expect(s.phase).toBe("engine-failed")
    expect(sessionView(s).primaryAction).toBe("diagnostics")
    const again = sessionReducer(s, { type: "retry" })
    expect(again).toMatchObject({ phase: "recovering", repo, attempt: 0 })
  })

  it("an unknown repository drops to no-repository with the reason", () => {
    const ready = run([
      { type: "health-ok", health },
      { type: "repo-opened", repo },
    ])
    const s = sessionReducer(ready, { type: "repo-unknown", reason: "session evicted" })
    expect(s).toEqual({ phase: "no-repository", health, lastError: "session evicted" })
    expect(sessionView(s).statusText).toContain("session evicted")
    expect(sessionView(s).primaryAction).toBe("open-repository")
  })

  it("engine exit is terminal until retried and carries the log path", () => {
    const ready = run([
      { type: "health-ok", health },
      { type: "repo-opened", repo },
    ])
    const s = sessionReducer(ready, { type: "engine-exited", reason: "exit 137", log: "/tmp/engine.log" })
    expect(s).toEqual({ phase: "engine-failed", reason: "exit 137", repo, log: "/tmp/engine.log" })
    expect(sessionReducer(s, { type: "health-failed", reason: "x" })).toBe(s)
  })

  it("every phase has a view with consistent flags", () => {
    const phases: SessionPhase[] = [
      initialSession,
      { phase: "demo" },
      { phase: "no-repository", health, lastError: null },
      { phase: "ready", health, repo },
      { phase: "busy", health, repo, label: "x" },
      { phase: "recovering", health, repo, reason: "r", attempt: 1 },
      { phase: "engine-failed", reason: "r", repo: null, log: null },
    ]
    for (const p of phases) {
      const v = sessionView(p)
      // offline and live are mutually exclusive; demo implies live.
      expect(v.offline && v.live).toBe(false)
      if (v.demo) expect(v.live).toBe(true)
      if (v.busy) expect(v.live).toBe(true)
    }
  })
})
