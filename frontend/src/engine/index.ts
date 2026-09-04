// Engine access for the UI. Types are shared with the C# DTOs, the client is
// an immutable {baseUrl, token, repoId} object (v0.13.12), and React code
// gets the one bound to its window's repository from `useEngine()`.
export * from "./types"
export { EngineClient, EngineError, READ_TIMEOUT_MS, changeKindOf, describeThrown, isAbort } from "./client"
export type { EngineConfig, RequestOptions } from "./client"
export { bootstrapEngine, pinnedRepoId, rememberPinnedRepo } from "./bootstrap"
export { EngineProvider } from "./context"
export { useEngine, useEngineBase } from "./useEngine"
