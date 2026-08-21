import CallSplitIcon from "@mui/icons-material/CallSplit"
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft"
import ChevronRightIcon from "@mui/icons-material/ChevronRight"
import CloudOutlinedIcon from "@mui/icons-material/CloudOutlined"
import ExpandMoreIcon from "@mui/icons-material/ExpandMore"
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined"
import SellOutlinedIcon from "@mui/icons-material/SellOutlined"
import Box from "@mui/material/Box"
import IconButton from "@mui/material/IconButton"
import ListItemIcon from "@mui/material/ListItemIcon"
import ListItemText from "@mui/material/ListItemText"
import List from "@mui/material/List"
import ListItemButton from "@mui/material/ListItemButton"
import ListSubheader from "@mui/material/ListSubheader"
import Menu from "@mui/material/Menu"
import MenuItem from "@mui/material/MenuItem"
import Paper from "@mui/material/Paper"
import Typography from "@mui/material/Typography"
import { useMemo, useState, type ReactNode } from "react"
import type { RefItem, RefTree } from "../engine"

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
}

type CtxMenu =
  | { kind: "branch"; name: string; x: number; y: number }
  | { kind: "tag"; name: string; x: number; y: number }
  | { kind: "remote"; name: string; x: number; y: number }
  | { kind: "submodule"; path: string; x: number; y: number }

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
}

export function RepoTree({
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
      .map(([remote, items]) => ({ node: { name: remote, children: buildTree(items, 1) }, count: items.length }))
  }, [tree])

  return (
    <Paper data-testid="left-panel" sx={{ width: 232, flexShrink: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
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
      <List dense disablePadding sx={{ overflow: "auto", userSelect: "none" }}>
        <Section title="Branches">
          {branchRoot.map((n) => (
            <BranchableRow
              key={n.name}
              node={n}
              depth={0}
              isDir={n.children.length > 0}
              defaultOpen
              icon={<CallSplitIcon sx={{ fontSize: 14 }} />}
              onSelectTarget={onSelectTarget}
              onContext={(x, y) => setCtx({ kind: "branch", name: n.name, x, y })}
            />
          ))}
        </Section>
        <Section title="Remotes">
          {remoteRoots.map(({ node }) => (
            <RemoteGroupRow
              key={node.name}
              node={node}
              onSelectTarget={onSelectTarget}
              onContext={(x, y) => setCtx({ kind: "remote", name: node.name, x, y })}
            />
          ))}
        </Section>
        <Section title="Tags">
          {tagRoot.map((n) => (
            <BranchableRow
              key={n.name}
              node={n}
              depth={0}
              isDir={n.children.length > 0}
              defaultOpen={false}
              icon={<SellOutlinedIcon sx={{ fontSize: 13 }} />}
              onSelectTarget={onSelectTarget}
              onContext={(x, y) => setCtx({ kind: "tag", name: n.name, x, y })}
            />
          ))}
        </Section>
        <Section title="Submodules">
          {(tree?.submodules ?? []).map((s) => (
            <ListItemButton
              key={s.path}
              dense
              sx={{ pl: 1, py: 0 }}
              onClick={() => onOpenSubmodule?.(s.path)}
              onContextMenu={(e) => {
                e.preventDefault()
                setCtx({ kind: "submodule", path: s.path, x: e.clientX, y: e.clientY })
              }}
            >
              <Box component="span" sx={{ display: "inline-flex", width: 20, justifyContent: "center", flexShrink: 0 }} />
              <ListItemIcon sx={{ minWidth: 20 }}>
                <FolderOutlinedIcon sx={{ fontSize: 14 }} />
              </ListItemIcon>
              <ListItemText primary={s.name} slotProps={{ primary: { variant: "body2" } }} />
            </ListItemButton>
          ))}
        </Section>
      </List>

      <Menu open={ctx !== null} onClose={() => setCtx(null)} anchorReference="anchorPosition" anchorPosition={ctx ? { top: ctx.y, left: ctx.x } : undefined}>
        {itemsFor(ctx).map((item) => (
          <MenuItem key={item.testid} data-testid={item.testid} onClick={() => { item.action(); setCtx(null) }}>
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

function RemoteGroupRow({
  node,
  onSelectTarget,
  onContext,
}: {
  node: TreeNode
  onSelectTarget?: (sha: string) => void
  onContext: (x: number, y: number) => void
}) {
  const [open, setOpen] = useState(true)
  return (
    <>
      <ListItemButton
        dense
        sx={{ pl: 1, py: 0 }}
        onClick={() => setOpen((v) => !v)}
        onContextMenu={(e) => {
          e.preventDefault()
          onContext(e.clientX, e.clientY)
        }}
      >
        <Box component="span" sx={{ display: "inline-flex", width: 20, justifyContent: "center", flexShrink: 0 }}>
          {open ? <ExpandMoreIcon sx={{ fontSize: 16 }} /> : <ChevronRightIcon sx={{ fontSize: 16 }} />}
        </Box>
        <ListItemIcon sx={{ minWidth: 20 }}>
          <CloudOutlinedIcon sx={{ fontSize: 14 }} />
        </ListItemIcon>
        <ListItemText
          primary={node.name}
          slotProps={{ primary: { variant: "body2", sx: { color: "text.secondary" } } }}
        />
      </ListItemButton>
      {open && node.children.map((child) => (
        <BranchableRow
          key={child.name}
          node={child}
          depth={1}
          isDir={child.children.length > 0}
          defaultOpen={false}
          icon={<CallSplitIcon sx={{ fontSize: 13 }} />}
          onSelectTarget={onSelectTarget}
        />
      ))}
    </>
  )
}

function BranchableRow({
  node,
  depth,
  isDir,
  defaultOpen,
  icon,
  onSelectTarget,
  onContext,
}: {
  node: TreeNode
  depth: number
  isDir: boolean
  defaultOpen: boolean
  icon?: ReactNode
  onSelectTarget?: (sha: string) => void
  onContext?: (x: number, y: number) => void
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <>
      <ListItemButton
        dense
        selected={!isDir && node.current}
        sx={{ pl: 1 + depth * 1.5, py: 0 }}
        onClick={() => (isDir ? setOpen((v) => !v) : onSelectTarget?.(node.target!))}
        onContextMenu={
          onContext
            ? (e) => {
                e.preventDefault()
                onContext(e.clientX, e.clientY)
              }
            : undefined
        }
      >
        <Box component="span" sx={{ display: "inline-flex", width: 20, justifyContent: "center", flexShrink: 0 }}>
          {isDir &&
            (open ? <ExpandMoreIcon sx={{ fontSize: 16 }} /> : <ChevronRightIcon sx={{ fontSize: 16 }} />)}
        </Box>
        {!isDir && icon && (
          <ListItemIcon sx={{ minWidth: 20 }}>
            {icon}
          </ListItemIcon>
        )}
        <ListItemText
          primary={node.name}
          slotProps={{
            primary: {
              variant: "body2",
              sx: {
                fontWeight: !isDir && node.current ? 700 : 400,
                color: !isDir && node.current ? "primary.main" : isDir ? "text.secondary" : "text.primary",
              },
            },
          }}
        />
      </ListItemButton>
      {isDir && open && (
        <>
          {node.children.map((child) => (
            <BranchableRow
              key={child.name}
              node={child}
              depth={depth + 1}
              isDir={child.children.length > 0}
              defaultOpen={false}
              icon={icon}
              onSelectTarget={onSelectTarget}
              onContext={onContext}
            />
          ))}
        </>
      )}
    </>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <>
      <ListSubheader
        disableSticky
        data-testid={`tree-section-${title.toLowerCase()}`}
        onClick={() => setOpen((v) => !v)}
        sx={{
          display: "flex",
          alignItems: "center",
          cursor: "pointer",
          userSelect: "none",
          lineHeight: "28px",
          "&:hover": { color: "text.primary" },
        }}
      >
        <Box component="span" sx={{ display: "inline-flex", width: 18, justifyContent: "center", mr: 0.25 }}>
          {open ? <ExpandMoreIcon sx={{ fontSize: 15 }} /> : <ChevronRightIcon sx={{ fontSize: 15 }} />}
        </Box>
        {title}
      </ListSubheader>
      {open && children}
    </>
  )
}
