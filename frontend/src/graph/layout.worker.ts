import { createLayouter } from "./layout"
import type { Revision } from "./types"

// Runs lane layout off the main thread so a fresh commit batch never blocks
// interaction. History arrives in pages: `reset` starts a new layout, an
// append continues the previous one so the prefix is never re-laid-out.
// Requests carry a sequence number; replies older than the last reset are
// dropped by the main thread.
let layouter = createLayouter()

self.onmessage = (e: MessageEvent<{ seq: number; reset: boolean; revisions: Revision[] }>) => {
  const { seq, reset, revisions } = e.data
  if (reset) layouter = createLayouter()
  const from = layouter.rowCount()
  const rows = layouter.append(revisions)
  ;(self as unknown as Worker).postMessage({ seq, reset, from, rows })
}
