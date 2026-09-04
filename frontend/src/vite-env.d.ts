/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ENGINE_URL?: string
  readonly VITE_ENGINE_TOKEN?: string
  /** "1" builds the sample-data demo (GitHub Pages); never inferred from engine failure (v0.13.12). */
  readonly VITE_DEMO?: string
}
