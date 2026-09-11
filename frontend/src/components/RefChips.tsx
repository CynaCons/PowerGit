import CloudOutlinedIcon from "@mui/icons-material/CloudOutlined"
import SellOutlinedIcon from "@mui/icons-material/SellOutlined"

export type RefKind = "head" | "stash" | "tag" | "remote" | "local"
export type RefMenuKind = "local" | "remote" | "tag"

type Props = {
  refs: string[]
  /** Tag names from the ref tree; matching chips get the tag glyph. */
  tagSet: Set<string>
  /** Remote names from the ref tree; a ref whose first segment is one of
   *  them is a remote-tracking branch. Without it, any slash counts. */
  remoteNames?: string[]
  onRefContextMenu?: (e: React.MouseEvent, ref: string, kind: RefMenuKind) => void
}

// The ref chips at the head of a row's message cell (lifted out of
// RevisionGrid.tsx in v0.18.1 to keep that file under the lint cap; no
// behaviour change). HEAD first, then local, then remote; three shown and
// the rest folded into a "+n" chip.
export function RefChips({ refs, tagSet, remoteNames, onRefContextMenu }: Props) {
  const visible = visibleRefs(refs)
  const isRemote = (ref: string) => {
    const slash = ref.indexOf("/")
    if (slash < 0) return false
    return !remoteNames || remoteNames.length === 0 || remoteNames.includes(ref.slice(0, slash))
  }
  return (
    <span className="msg-refs">
      {visible.shown.map((ref) => {
        const tag = ref !== "HEAD" && tagSet.has(ref)
        const remote = ref !== "HEAD" && !tag && !ref.includes("stash") && isRemote(ref)
        const kind: RefKind =
          ref === "HEAD" ? "head" : ref.includes("stash") ? "stash" : tag ? "tag" : remote ? "remote" : "local"
        const menuKind = kind === "local" || kind === "remote" || kind === "tag" ? kind : null
        return (
          <span
            key={ref}
            className={`ref${kind === "local" ? "" : ` ${kind}`}`}
            data-ref-kind={kind}
            data-ref={ref}
            onContextMenu={
              onRefContextMenu && menuKind
                ? (e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    onRefContextMenu(e, ref, menuKind)
                  }
                : undefined
            }
          >
            {/* v0.13.19, owner: "a little cloud icon on the left of the remote branches";
                v0.14.0: "tags should be having a different little icon" */}
            {remote && <CloudOutlinedIcon className="ref-cloud" />}
            {tag && <SellOutlinedIcon className="ref-cloud" />}
            {ref}
          </span>
        )
      })}
      {visible.extra > 0 ? <span className="ref extra">+{visible.extra}</span> : null}
    </span>
  )
}

function visibleRefs(refs: string[]) {
  const head = refs.filter((r) => r === "HEAD")
  const local = refs.filter((r) => r !== "HEAD" && !r.includes("/"))
  const remote = refs.filter((r) => r.includes("/"))
  const ordered = [...head, ...local, ...remote]
  const max = 3
  if (ordered.length <= max) return { shown: ordered, extra: 0 }
  return { shown: ordered.slice(0, max), extra: ordered.length - max }
}
