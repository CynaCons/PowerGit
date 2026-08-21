import ExpandLess from "@mui/icons-material/ExpandLess"
import ExpandMore from "@mui/icons-material/ExpandMore"
import type { ReactNode } from "react"
import Box from "@mui/material/Box"
import Collapse from "@mui/material/Collapse"
import List from "@mui/material/List"
import ListItemButton from "@mui/material/ListItemButton"
import ListItemText from "@mui/material/ListItemText"
import ListSubheader from "@mui/material/ListSubheader"
import Paper from "@mui/material/Paper"
import Typography from "@mui/material/Typography"
import { useMemo, useState } from "react"
import type { RefItem, RefTree } from "../engine"

type Props = {
  tree: RefTree | null
  onSelectTarget?: (sha: string) => void
}

export function RepoTree({ tree, onSelectTarget }: Props) {
  const remotes = useMemo(() => groupRemotes(tree?.remotes ?? []), [tree])

  return (
    <Paper data-testid="left-panel" sx={{ width: 260, flexShrink: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: "divider" }}>
        <Typography variant="subtitle2">Repository</Typography>
      </Box>
      <List dense disablePadding sx={{ overflow: "auto" }}>
        <Section title="Branches">
          {(tree?.branches ?? []).map((b) => (
            <RefRow key={b.fullName} item={b} onSelectTarget={onSelectTarget} />
          ))}
        </Section>
        <Section title="Remotes">
          {remotes.map((g) => (
            <RemoteGroup key={g.name} group={g} onSelectTarget={onSelectTarget} defaultOpen={false} />
          ))}
        </Section>
        <Section title="Tags">
          <RemoteGroup
            group={{ name: "tags", items: (tree?.tags ?? []).map((t) => ({ ...t, name: `tags/${t.name}` })) }}
            onSelectTarget={onSelectTarget}
            defaultOpen={false}
            label="all"
          />
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

function RefRow({ item, onSelectTarget, depth = 0 }: { item: RefItem; onSelectTarget?: (sha: string) => void; depth?: number }) {
  return (
    <ListItemButton selected={item.current} sx={{ pl: 2 + depth * 2 }} onClick={() => onSelectTarget?.(item.target)}>
      <ListItemText primary={item.name} />
    </ListItemButton>
  )
}

function RemoteGroup({
  group,
  onSelectTarget,
  defaultOpen = false,
  label,
}: {
  group: { name: string; items: RefItem[] }
  onSelectTarget?: (sha: string) => void
  defaultOpen?: boolean
  label?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <>
      <ListItemButton onClick={() => setOpen((v) => !v)}>
        <ListItemText primary={label ?? group.name} secondary={`${group.items.length}`} />
        {open ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
      </ListItemButton>
      <Collapse in={open} timeout="auto" unmountOnExit>
        <List dense disablePadding>
          {group.items.map((item) => (
            <RefRow
              key={item.fullName}
              item={{ ...item, name: item.name.slice(group.name.length + 1) || item.name }}
              onSelectTarget={onSelectTarget}
              depth={1}
            />
          ))}
        </List>
      </Collapse>
    </>
  )
}

function groupRemotes(items: RefItem[]) {
  const groups = new Map<string, RefItem[]>()
  for (const item of items) {
    const remote = item.name.split("/")[0] ?? item.name
    const list = groups.get(remote) ?? []
    list.push(item)
    groups.set(remote, list)
  }
  return [...groups.entries()].map(([name, grouped]) => ({ name, items: grouped }))
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <ListSubheader disableSticky>{title}</ListSubheader>
      {children}
    </>
  )
}
