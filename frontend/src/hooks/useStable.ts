import { useRef } from "react"

// Stable function identities over a bag of callbacks that are recreated on
// every render (inline lambdas, hook results without useCallback). Each
// returned function keeps its identity for the component's lifetime and
// forwards to the latest implementation, so memo()-wrapped children such
// as RepoTree and CommandBar do not re-render on every selection change.
// This is the "latest ref" pattern; it must not be used for callbacks that
// are read during render (they are read at call time only).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Callbacks = Record<string, (...args: any[]) => unknown>

export function useStable<T extends Callbacks>(callbacks: T): T {
  const latest = useRef(callbacks)
  latest.current = callbacks
  const stable = useRef<T | null>(null)
  if (stable.current === null) {
    const wrappers: Record<string, (...args: unknown[]) => unknown> = {}
    for (const key of Object.keys(callbacks)) {
      wrappers[key] = (...args: unknown[]) => latest.current[key](...args)
    }
    stable.current = wrappers as T
  }
  return stable.current
}
