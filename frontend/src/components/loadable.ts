// Async state of a pane's content (shared by BottomPanel and DiffPane).
export type Loadable<T> =
  | { kind: "idle" }
  | { kind: "loading" }
  // `stale`: the previous selection's value, kept on screen while the next
  // one loads (v0.13.14, owner: the white "Loading commit…" swap between
  // selections "creates a visual break and flicker").
  | { kind: "ready"; value: T; stale?: boolean }
  | { kind: "error"; message: string }
