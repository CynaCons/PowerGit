import { createContext, useContext } from "react"
import type { RefTree } from "../engine"

// Where each tag lives (v0.21.16, owner: "we don't have the ability to
// differentiate between a remote tag and a local tag ... The icon is not
// there, you know, the cloud icon to indicate that it's remote. And if the
// tag is local, then I don't have the ability to push it to remote"). The
// engine marks each tag with the remotes that have it, from what they
// answered on fetch or tag push; a tag no answering remote has is local,
// and before any remote answered it is unknown — no cloud, no claim.

export type TagWhere = "remote" | "local" | "unknown"
export type TagPlace = { where: TagWhere; remotes: string[] }
export type TagPlaces = {
  places: ReadonlyMap<string, TagPlace>
  /** Where "Push tag" goes: origin, else the first remote; null without one. */
  pushRemote: string | null
}

export const NO_TAG_PLACES: TagPlaces = { places: new Map(), pushRemote: null }

export function tagPlaces(tree: RefTree | null, remoteNames: readonly string[]): TagPlaces {
  const known = tree?.remoteTagsKnown ?? []
  const places = new Map<string, TagPlace>()
  for (const t of tree?.tags ?? []) {
    const remotes = t.remotes ?? []
    places.set(t.name, { where: remotes.length > 0 ? "remote" : known.length > 0 ? "local" : "unknown", remotes })
  }
  const all = [...new Set([...remoteNames, ...known])]
  return { places, pushRemote: all.includes("origin") ? "origin" : (all[0] ?? null) }
}

/** The tag's place; a name the tree does not list is unknown. */
export function placeOf(name: string, p: TagPlaces): TagPlace {
  return p.places.get(name) ?? { where: "unknown", remotes: [] }
}

/** The remote "Push tag" offers, or null when it already has the tag (or there is no remote). */
export function tagPushTarget(name: string, p: TagPlaces): string | null {
  if (!p.pushRemote) return null
  return placeOf(name, p).remotes.includes(p.pushRemote) ? null : p.pushRemote
}

/** The chip's and the tree row's tooltip: the name, then where it is. */
export function tagTitle(name: string, place: TagPlace): string {
  if (place.where === "remote") return `${name} · on ${place.remotes.join(", ")}`
  if (place.where === "local") return `${name} · local only`
  return name
}

export const TagPlacesContext = createContext<TagPlaces>(NO_TAG_PLACES)

export function useTagPlaces(): TagPlaces {
  return useContext(TagPlacesContext)
}
