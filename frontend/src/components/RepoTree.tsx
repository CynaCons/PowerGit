import ChevronLeftIcon from "@mui/icons-material/ChevronLeft"
import SearchIcon from "@mui/icons-material/Search"
import Box from "@mui/material/Box"
import IconButton from "@mui/material/IconButton"
import InputBase from "@mui/material/InputBase"
import Menu from "@mui/material/Menu"
import MenuItem from "@mui/material/MenuItem"
import Paper from "@mui/material/Paper"
import Typography from "@mui/material/Typography"
import { useVirtualizer } from "@tanstack/react-virtual"
import { memo, useEffect, useMemo, useRef, useState } from "react"
import type { RefItem, RefTree } from "../engine"
import { ROW_HEIGHT, SECTION_HEIGHT, SectionHeader, TreeRow, type Item } from "./RepoTreeRows"

type Props = {
  tree: RefTree | null
  onSelectTarget?: (sha: string) => void
  onCollapse?: () => void
  onCheckoutRef?: (name: string) => void
  onDeleteBranch?: (name: string) => void
  onDeleteTag?: (name: string) => void
  onFetchRemote?: (name: string) => void
  onConfigureRemote?: (name: string) => void
  onOpenSubmodule?: (path: string) => void
}

type TreeNode = {
  name: string
  children: TreeNode[]
  target?: string
  current?: boolean
  /** Full ref name of the leaf (e.g. "feature/x", "origin/main"). */
  full?: string
}

type CtxMenu =
  | { kind: "branch"; name: string; x: number; y: number }
  | { kind: "tag"; name: string; x: number; y: number }
  | { kind: "remote"; name: string; x: number; y: number }
  | { kind: "submodule"; path: string; x: number; y: number }

// Above this many refs a section/group starts collapsed: a monorepo can hold
// thousands of remote branches, and expanding them all by default buries the
// local branches. The filter box always searches ALL refs regardless.
const COLLAPSE_THRESHOLD = 500

function insert(root: TreeNode, segments: string[], item: RefItem) {
  let node = root
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    let child = node.children.find((c) => c.name === seg)
    if (!child) {
      child = { name: seg, children: [] }
      node.children.push(child)
    }
    if (i === segments.length - 1) {
      child.target = item.target
      child.current = item.current
      child.full = item.name
    }
    node = child
  }
}

function buildTree(items: RefItem[], splitOffset = 0): TreeNode[] {
  const root: TreeNode = { name: "", children: [] }
  for (const item of items) {
    const segments = item.name.split("/").slice(splitOffset).filter(Boolean)
    if (segments.length > 0) insert(root, segments, item)
  }
  sortNodes(root.children)
  return root.children
}

function sortNodes(nodes: TreeNode[]) {
  nodes.sort((a, b) => {
    const aDir = a.children.length > 0
    const bDir = b.children.length > 0
    if (aDir !== bDir) return aDir ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  for (const node of nodes) sortNodes(node.children)
}

function RepoTreeImpl({
  tree,
  onSelectTarget,
  onCollapse,
  onCheckoutRef,
  onDeleteBranch,
  onDeleteTag,
  onFetchRemote,
  onConfigureRemote,
  onOpenSubmodule,
}: Props) {
  const [ctx, setCtx] = useState<CtxMenu | null>(null)
  const [filter, setFilter] = useState("")
  // Explicit user toggles override the size-based defaults.
  const [sectionOverride, setSectionOverride] = useState<ReadonlyMap<string, boolean>>(new Map())
  const [nodeOverride, setNodeOverride] = useState<ReadonlyMap<string, boolean>>(new Map())
  const scrollRef = useRef<HTMLDivElement>(null)

  const branchRoot = useMemo(() => buildTree(tree?.branches ?? []), [tree])
  const tagRoot = useMemo(() => buildTree(tree?.tags ?? []), [tree])
  const remoteRoots = useMemo(() => {
    const groups = new Map<string, RefItem[]>()
    for (const r of tree?.remotes ?? []) {
      const remote = r.name.split("/")[0] ?? r.name
      const list = groups.get(remote) ?? []
      list.push(r)
      groups.set(remote, list)
    }
    return [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([remote, items]) => ({
        node: { name: remote, children: buildTree(items, 1) } as TreeNode,
        count: items.length,
      }))
  }, [tree])

  const remoteTotal = tree?.remotes.length ?? 0
  const tagTotal = tree?.tags.length ?? 0

  const items = useMemo(() => {
    const out: Item[] = []
    const q = filter.trim().toLowerCase()

    const toggleSection = (title: string) =>
      setSectionOverride((prev) => {
        const next = new Map(prev)
        next.set(title, !(prev.get(title) ?? sectionDefault(title)))
        return next
      })
    const sectionDefault = (title: string) => (title === "Tags" ? tagTotal <= COLLAPSE_THRESHOLD : true)
    const sectionOpen = (title: string) => sectionOverride.get(title) ?? sectionDefault(title)
    const toggleNode = (path: string, def: boolean) =>
      setNodeOverride((prev) => {
        const next = new Map(prev)
        next.set(path, !(prev.get(path) ?? def))
        return next
      })
    const nodeOpen = (path: string, def: boolean) => nodeOverride.get(path) ?? def

    const pushSection = (title: string, count?: number) =>
      out.push({
        key: `sec:${title}`,
        section: title,
        depth: 0,
        label: title,
        count,
        expandable: true,
        open: q ? true : sectionOpen(title),
        onClick: () => toggleSection(title),
      })

    const leafCtx = (icon: Item["icon"], full: string): ((x: number, y: number) => void) | undefined => {
      switch (icon) {
        case "branch":
          return (x, y) => setCtx({ kind: "branch", name: full, x, y })
        case "tag":
          return (x, y) => setCtx({ kind: "tag", name: full, x, y })
        case "remote":
          return (x, y) => setCtx({ kind: "remote", name: full.split("/")[0] ?? full, x, y })
        default:
          return undefined
      }
    }

    const walk = (
      nodes: TreeNode[],
      pathPrefix: string,
      depth: number,
      icon: Item["icon"],
      dirDefaultOpen: boolean,
      dirCtx?: (x: number, y: number) => void,
    ) => {
      for (const node of nodes) {
        const path = `${pathPrefix}/${node.name}`
        const isDir = node.children.length > 0
        if (isDir) {
          const open = nodeOpen(path, dirDefaultOpen)
          out.push({
            key: path,
            depth,
            label: node.name,
            icon,
            expandable: true,
            open,
            muted: true,
            onClick: () => toggleNode(path, dirDefaultOpen),
            onContext: dirCtx,
          })
          if (open) walk(node.children, path, depth + 1, icon, false, dirCtx)
        } else {
          const full = node.full ?? node.name
          out.push({
            key: path,
            depth,
            label: node.name,
            icon,
            current: node.current,
            onClick: () => {
              if (node.target) onSelectTarget?.(node.target)
            },
            onContext: node.current
              ? undefined
              : dirCtx && icon === "remote"
                ? dirCtx
                : (leafCtx(icon, full) ?? dirCtx),
          })
        }
      }
    }

    if (q) {
      // Filter mode: flat matches over ALL refs with their full names — the
      // guaranteed way to find any of thousands of branches.
      const bs = (tree?.branches ?? []).filter((b) => b.name.toLowerCase().includes(q))
      const rs = (tree?.remotes ?? []).filter((r) => r.name.toLowerCase().includes(q))
      const ts = (tree?.tags ?? []).filter((t) => t.name.toLowerCase().includes(q))
      const flat = (list: RefItem[], icon: Item["icon"], prefix: string) => {
        for (const item of list) {
          out.push({
            key: `${prefix}:${item.name}`,
            depth: 0,
            label: item.name,
            icon,
            current: item.current,
            onClick: () => onSelectTarget?.(item.target),
            onContext: item.current ? undefined : leafCtx(icon, item.name),
          })
        }
      }
      pushSection("Branches", bs.length)
      flat(bs, "branch", "b")
      pushSection("Remotes", rs.length)
      flat(rs, "remote", "r")
      pushSection("Tags", ts.length)
      flat(ts, "tag", "t")
      return out
    }

    pushSection("Branches")
    if (sectionOpen("Branches")) walk(branchRoot, "b", 0, "branch", true)

    pushSection("Remotes", remoteTotal > COLLAPSE_THRESHOLD ? remoteTotal : undefined)
    if (sectionOpen("Remotes")) {
      for (const { node, count } of remoteRoots) {
        const path = `r/${node.name}`
        const def = remoteTotal <= COLLAPSE_THRESHOLD
        const open = nodeOpen(path, def)
        const remoteCtx = (x: number, y: number) => setCtx({ kind: "remote", name: node.name, x, y })
        out.push({
          key: path,
          depth: 0,
          label: node.name,
          count: open ? undefined : count,
          icon: "remote",
          expandable: true,
          open,
          muted: true,
          onClick: () => toggleNode(path, def),
          onContext: remoteCtx,
        })
        if (open) walk(node.children, path, 1, "remote", false, remoteCtx)
      }
    }

    pushSection("Tags", tagTotal > COLLAPSE_THRESHOLD ? tagTotal : undefined)
    if (sectionOpen("Tags")) walk(tagRoot, "t", 0, "tag", false)

    pushSection("Submodules")
    if (sectionOpen("Submodules")) {
      for (const s of tree?.submodules ?? []) {
        out.push({
          key: `s/${s.path}`,
          depth: 0,
          label: s.name,
          icon: "submodule",
          onClick: () => onOpenSubmodule?.(s.path),
          onContext: (x, y) => setCtx({ kind: "submodule", path: s.path, x, y }),
        })
      }
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, filter, sectionOverride, nodeOverride, branchRoot, tagRoot, remoteRoots, remoteTotal, tagTotal])

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (items[i].section ? SECTION_HEIGHT : ROW_HEIGHT),
    overscan: 20,
  })
  // Expanding/filtering remaps index → item kind; drop stale size measurements.
  useEffect(() => {
    virtualizer.measure()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items])

  return (
    <Paper
      data-testid="left-panel"
      sx={{
        width: 240,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        borderRight: 1,
        borderColor: "divider",
      }}
    >
      <Box sx={{ px: 1, py: 0.75, borderBottom: 1, borderColor: "divider", display: "flex", alignItems: "center" }}>
        <Typography variant="subtitle2" sx={{ flex: 1, pl: 1 }}>
          Repository
        </Typography>
        {onCollapse && (
          <IconButton size="small" data-testid="left-panel-collapse" onClick={onCollapse} aria-label="Collapse panel">
            <ChevronLeftIcon fontSize="small" />
          </IconButton>
        )}
      </Box>
      <Box
        sx={{
          px: 1,
          py: 0.5,
          borderBottom: 1,
          borderColor: "divider",
          display: "flex",
          alignItems: "center",
          gap: 0.5,
        }}
      >
        <SearchIcon sx={{ fontSize: 14, color: "text.secondary" }} />
        <InputBase
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter refs…"
          inputProps={{ "data-testid": "tree-filter", "aria-label": "Filter refs" }}
          sx={{ flex: 1, fontSize: 12.5, "& input": { p: 0 } }}
        />
      </Box>
      <Box ref={scrollRef} sx={{ flex: 1, overflow: "auto", userSelect: "none" }}>
        <Box sx={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((vi) => {
            const item = items[vi.index]
            const style: React.CSSProperties = {
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              transform: `translateY(${vi.start}px)`,
            }
            return item.section ? (
              <SectionHeader key={item.key} item={item} style={style} />
            ) : (
              <TreeRow key={item.key} item={item} style={style} />
            )
          })}
        </Box>
      </Box>

      <Menu
        open={ctx !== null}
        onClose={() => setCtx(null)}
        anchorReference="anchorPosition"
        anchorPosition={ctx ? { top: ctx.y, left: ctx.x } : undefined}
      >
        {itemsFor(ctx).map((item) => (
          <MenuItem
            key={item.testid}
            data-testid={item.testid}
            onClick={() => {
              item.action()
              setCtx(null)
            }}
          >
            {item.label}
          </MenuItem>
        ))}
      </Menu>
    </Paper>
  )

  function itemsFor(c: CtxMenu | null): { label: string; testid: string; action: () => void }[] {
    if (!c) return []
    switch (c.kind) {
      case "branch":
        return [
          { label: "Checkout Branch", testid: "tree-checkout", action: () => onCheckoutRef?.(c.name) },
          { label: "Delete Branch…", testid: "tree-delete-branch", action: () => onDeleteBranch?.(c.name) },
        ]
      case "tag":
        return [
          { label: "Checkout Tag", testid: "tree-checkout-tag", action: () => onCheckoutRef?.(c.name) },
          { label: "Delete Tag…", testid: "tree-delete-tag", action: () => onDeleteTag?.(c.name) },
        ]
      case "remote":
        return [
          { label: "Fetch Remote", testid: "tree-fetch-remote", action: () => onFetchRemote?.(c.name) },
          { label: "Configure Remote…", testid: "tree-configure-remote", action: () => onConfigureRemote?.(c.name) },
        ]
      case "submodule":
        return [{ label: "Open Submodule", testid: "tree-open-submodule", action: () => onOpenSubmodule?.(c.path) }]
    }
  }
}

// Memoised: the ref tree only changes on a refs refresh, never on a row
// selection (App hands it stable callbacks via useStable).
export const RepoTree = memo(RepoTreeImpl)
