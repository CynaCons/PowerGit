/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ENGINE_URL?: string
  readonly VITE_ENGINE_TOKEN?: string
  /** "1" builds the sample-data demo (GitHub Pages); never inferred from engine failure (v0.13.12). */
  readonly VITE_DEMO?: string
  /** The perf probe's sink URL (e.g. http://127.0.0.1:7790); set only for perf probe builds (v0.20.6). */
  readonly VITE_PERF_PROBE?: string
}
