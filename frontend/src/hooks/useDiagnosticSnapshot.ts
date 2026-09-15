import { useEffect, useState } from "react"
import type { SnapshotState } from "../components/SnapshotDialog"
import { setStateSampler } from "../diagnostics"
import { buildFrontendDump, takeSnapshot } from "../diagnostics/snapshot"
import { describeThrown, type EngineClient, type RepoInfo } from "../engine"
import { getThemePreference } from "../theme/appearance"
import { getZoom } from "../theme/zoom"

type Deps = {
  client: EngineClient
  version: string | null
  phase: string
  repo: RepoInfo | null
  rowCount: number
  selectedSha: string | null
}

// Owner (v0.14.1): "dump all the information that we need in a file or
// package, and I'll bring it back to you". The dialog's state, the action
// behind the rail button, and the sampler the watchdog reads (lifted out of
// App.tsx in v0.18.5 for the 400-line cap; no behaviour change).
export function useDiagnosticSnapshot({ client, version, phase, repo, rowCount, selectedSha }: Deps) {
  const [snapshot, setSnapshot] = useState<SnapshotState>({ phase: "idle" })
  const takeDiagnosticSnapshot = async () => {
    setSnapshot({ phase: "working" })
    try {
      const dump = await buildFrontendDump({
        client,
        version,
        phase,
        repo,
        rows: rowCount,
        selected: selectedSha,
        zoom: getZoom(),
        theme: getThemePreference(),
      })
      setSnapshot({ phase: "done", result: await takeSnapshot(dump) })
    } catch (e) {
      setSnapshot({ phase: "error", message: describeThrown(e) })
    }
  }
  const repoName = repo?.name ?? null
  useEffect(() => {
    setStateSampler(() => ({ phase, rows: rowCount, repo: repoName }))
    return () => setStateSampler(null)
  }, [phase, rowCount, repoName])
  return { snapshot, takeDiagnosticSnapshot, closeSnapshot: () => setSnapshot({ phase: "idle" }) }
}
