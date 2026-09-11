// Author identity in the revision grid (v0.18.1, prototype A): every row
// gets an 18 px disc with the author's initials before the name, coloured
// from the ref-badge palette by a stable hash of the author, so runs of one
// author read even with nothing selected. The palette is the six ref-badge
// pairs tokens.ts already exports as --pg-ref-<k>-bg / -fg; app.css maps
// data-palette to them. Memoised per name: the grid renders thousands of
// rows and the same handful of authors.

export type AuthorPalette = "local" | "remote" | "tag" | "stash" | "head" | "extra"

const PALETTES: readonly AuthorPalette[] = ["local", "remote", "tag", "stash", "head", "extra"]

/**
 * "Constantin Chabirand" → "CC", "Mara" → "MA", "jean-luc picard" → "JP",
 * "dependabot[bot]" → "DE", "cynako@gmail.com" → "CY", "" → "?".
 * An email keeps its local part, a "[bot]" suffix is dropped, and a
 * hyphenated word counts as one; dots and underscores split like spaces
 * ("jean.luc" → "JL").
 */
export function initials(author: string): string {
  const name = author
    .replace(/@.*$/, "")
    .replace(/\[[^\]]*\]/g, "")
    .trim()
  const words = name
    .split(/[\s._]+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((w) => w.length > 0)
  if (words.length === 0) return "?"
  const pick = words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[words.length - 1][0]
  return pick.toUpperCase()
}

/** FNV-1a over the UTF-16 code units, onto the six ref-badge pairs. */
export function paletteOf(author: string): AuthorPalette {
  let h = 0x811c9dc5
  for (let i = 0; i < author.length; i++) {
    h ^= author.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return PALETTES[h % PALETTES.length]
}

export type AuthorIdentity = { initials: string; palette: AuthorPalette }

const cache = new Map<string, AuthorIdentity>()

export function authorIdentity(author: string): AuthorIdentity {
  let id = cache.get(author)
  if (!id) {
    id = { initials: initials(author), palette: paletteOf(author) }
    cache.set(author, id)
  }
  return id
}
