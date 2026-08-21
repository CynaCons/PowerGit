import ChevronLeftIcon from "@mui/icons-material/ChevronLeft"
import ChevronRightIcon from "@mui/icons-material/ChevronRight"
import ExpandMoreIcon from "@mui/icons-material/ExpandMore"
import Box from "@mui/material/Box"
import IconButton from "@mui/material/IconButton"
import List from "@mui/material/List"
import ListItemButton from "@mui/material/ListItemButton"
import ListItemText from "@mui/material/ListItemText"
import ListSubheader from "@mui/material/ListSubheader"
import Paper from "@mui/material/Paper"
import Typography from "@mui/material/Typography"
import { useMemo, useState, type ReactNode } from "react"
import type { RefItem, RefTree } from "../engine"

type Props = {
  tree: RefTree | null
  onSelectTarget?: (sha: string) => void
  onCollapse?: () => void
}

type TreeNode = {
  name: string
  children: TreeNode[]
  target?: string
  current?: boolean
}

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

export function RepoTree({ tree, onSelectTarget, onCollapse }: Props) {
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
      <List dense disablePadding sx={{ overflow: "auto" }}>
        <Section title="Branches">
          {branchRoot.map((n) => (
            <BranchableRow key={n.name} node={n} depth={0} isDir={n.children.length > 0} defaultOpen onSelectTarget={onSelectTarget} />
          ))}
        </Section>
        <Section title="Remotes">
          {remoteRoots.map(({ node }) => (
            <BranchableRow key={node.name} node={node} depth={0} isDir={true} defaultOpen onSelectTarget={onSelectTarget} />
          ))}
        </Section>
        <Section title="Tags">
          {tagRoot.map((n) => (
            <BranchableRow key={n.name} node={n} depth={0} isDir={n.children.length > 0} defaultOpen={false} onSelectTarget={onSelectTarget} />
          ))}
        </Section>
        <Section title="Submodules">
          {(tree?.submodules ?? []).map((s) => (
            <ListItemButton key={s.path}>
              <ListItemText primary={s.name} secondary={s.path} />
            </ListItemButton>
          ))}
        </Section>
      </List>
    </Paper>
  )
}

function BranchableRow({
  node,
  depth,
  isDir,
  defaultOpen,
  onSelectTarget,
}: {
  node: TreeNode
  depth: number
  isDir: boolean
  defaultOpen: boolean
  onSelectTarget?: (sha: string) => void
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <>
      <ListItemButton
        dense
        selected={!isDir && node.current}
        sx={{ pl: 1 + depth * 1.5, py: 0 }}
        onClick={() => (isDir ? setOpen((v) => !v) : onSelectTarget?.(node.target!))}
      >
        <Box component="span" sx={{ display: "inline-flex", width: 20, justifyContent: "center", flexShrink: 0 }}>
          {isDir &&
            (open ? <ExpandMoreIcon sx={{ fontSize: 16 }} /> : <ChevronRightIcon sx={{ fontSize: 16 }} />)}
        </Box>
        <ListItemText
          primary={node.name}
          slotProps={{
            primary: {
              variant: "body2",
              sx: { fontWeight: !isDir && node.current ? 700 : 400, color: isDir ? "text.secondary" : "text.primary" },
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
              onSelectTarget={onSelectTarget}
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
