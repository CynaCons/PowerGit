import { requestRecovery } from "../diagnostics/recovery"
import { CATALOG, recoveryStepOf } from "./catalog"
import type { HandlerMap } from "./dispatch"

/**
 * The `global` scope's handlers: the recovery ladder (v0.15.6). Built from
 * the catalog so the chords and the steps cannot drift apart. `run` is
 * injectable for tests; the default asks the shell and swallows the
 * rejection (the report() inside requestRecovery already logged the press).
 */
export function recoveryHandlers(
  run: (step: number) => void = (s) => void requestRecovery(s).catch(() => undefined),
): HandlerMap {
  const map: HandlerMap = {}
  for (const def of CATALOG) {
    const step = recoveryStepOf(def.id)
    if (step !== null) map[def.id] = () => run(step)
  }
  return map
}
