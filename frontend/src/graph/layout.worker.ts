import { layoutGraph } from "./layout"
import type { Revision } from "./types"

// Runs lane layout off the main thread so a fresh 800+ commit batch never
// blocks interaction. Requests carry a sequence number; the latest one wins.
self.onmessage = (e: MessageEvent<{ seq: number; revisions: Revision[] }>) => {
  const { seq, revisions } = e.data
  const started = performance.now()
  const rows = layoutGraph(revisions)
  ;(self as unknown as Worker).postMessage({ seq, rows, ms: performance.now() - started })
}
