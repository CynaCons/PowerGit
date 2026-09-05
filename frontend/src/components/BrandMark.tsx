// The PowerGit mark (v0.13.14): the crossing lanes as two equal strokes in
// one blue family. Same geometry as src/assets/logo.svg, the source every
// platform icon is generated from (`npm run icons`); inlined here so the
// app bar needs no asset request and the colours can follow the theme.
export function BrandMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false" data-testid="brand-mark">
      <path
        d="M14 14c12 0 14 8 18 18s6 18 18 18"
        fill="none"
        stroke="var(--pg-brand-deep, #1553c9)"
        strokeWidth="9"
        strokeLinecap="round"
      />
      <path
        d="M14 50c12 0 14-8 18-18s6-18 18-18"
        fill="none"
        stroke="var(--pg-brand-light, #7ec6ff)"
        strokeWidth="9"
        strokeLinecap="round"
      />
    </svg>
  )
}
