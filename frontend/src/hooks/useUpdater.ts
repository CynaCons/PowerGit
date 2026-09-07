import { useCallback, useMemo, useReducer, useRef } from "react"
import { describeThrown } from "../engine"
import { initialUpdateState, updateReducer, type UpdateState } from "../updates/updateMachine"
import { createUpdater, updaterKind } from "../updates/updater"

export type UpdaterApi = {
  state: UpdateState
  kind: ReturnType<typeof updaterKind>
  checkNow: () => void
  install: () => void
}

// Manual updates (v0.14.0): nothing happens until the user presses
// "Check for updates" in Settings; nothing is downloaded until they press
// "Download and restart". The machine is pure (updateMachine.ts); this hook
// only wires it to the adapter.
export function useUpdater(): UpdaterApi {
  const [state, dispatch] = useReducer(updateReducer, initialUpdateState)
  const updater = useMemo(createUpdater, [])
  const kind = useMemo(updaterKind, [])
  // A check that finishes after another one started must not report into
  // the newer one.
  const checkSeq = useRef(0)

  const checkNow = useCallback(() => {
    const seq = ++checkSeq.current
    dispatch({ type: "check" })
    void updater
      .check()
      .then((update) => {
        if (seq !== checkSeq.current) return
        if (update) dispatch({ type: "found", update })
        else dispatch({ type: "none", current: "" })
      })
      .catch((e: unknown) => {
        if (seq === checkSeq.current) dispatch({ type: "failed", message: describeThrown(e) })
      })
  }, [updater])

  const install = useCallback(() => {
    dispatch({ type: "install" })
    void updater
      .install((e) => {
        if (e.event === "Started") dispatch({ type: "started", total: e.total })
        else if (e.event === "Progress") dispatch({ type: "progress", chunk: e.chunk })
        else dispatch({ type: "finished" })
      })
      .catch((e: unknown) => dispatch({ type: "failed", message: describeThrown(e) }))
  }, [updater])

  return { state, kind, checkNow, install }
}
