import ChevronRightIcon from "@mui/icons-material/ChevronRight"
import ExpandMoreIcon from "@mui/icons-material/ExpandMore"
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined"
import Box from "@mui/material/Box"
import CircularProgress from "@mui/material/CircularProgress"
import Typography from "@mui/material/Typography"
import { useEffect, useState, type ReactNode } from "react"
import { describeThrown, fetchTree, type TreeEntry } from "../engine"

type Props = {
  commitId: string | null
  onSelectFile?: (path: string) => void
}

type Loaded = { entries: TreeEntry[]; error: string | null }

export function CommitFileTree({ commitId, onSelectFile }: Props) {
  const [root, setRoot] = useState<Loaded | null>(null)
  const [dirs, setDirs] = useState<Map<string, Loaded>>(new Map())

  useEffect(() => {
    setRoot(null)
    setDirs(new Map())
    if (!commitId) return
    let cancelled = false
    fetchTree(commitId)
      .then((entries) => {
        if (!cancelled) setRoot({ entries, error: null })
      })
      .catch((e: unknown) => {
        if (!cancelled) setRoot({ entries: [], error: describeThrown(e) })
      })
    return () => {
      cancelled = true
    }
  }, [commitId])

  function toggleDir(path: string) {
    if (!commitId) return
    if (dirs.has(path)) {
      setDirs((prev) => {
        const next = new Map(prev)
        next.delete(path)
        return next
      })
      return
    }
    setDirs((prev) => new Map(prev).set(path, { entries: [], error: null }))
    fetchTree(commitId, path)
      .then((entries) => setDirs((prev) => new Map(prev).set(path, { entries, error: null })))
      .catch((e: unknown) =>
        setDirs((prev) => new Map(prev).set(path, { entries: [], error: describeThrown(e) })),
      )
  }

  if (!commitId) {
    return (
      <Box data-testid="commit-file-tree" sx={{ p: 2 }}>
        <Typography color="text.secondary">Select a revision.</Typography>
      </Box>
    )
  }
  if (!root) {
    return (
      <Box data-testid="commit-file-tree" sx={{ p: 2 }}>
        <CircularProgress size={18} />
      </Box>
    )
  }
  if (root.error) {
    return (
      <Box data-testid="commit-file-tree" sx={{ p: 2 }}>
        <Typography color="error">{root.error}</Typography>
      </Box>
    )
  }

  return (
    <Box data-testid="commit-file-tree" sx={{ overflow: "auto", py: 0.5 }}>
      <Level commitId={commitId} entries={root.entries} depth={0} prefix="" dirs={dirs} onToggle={toggleDir} onSelectFile={onSelectFile} />
    </Box>
  )
}

function Level({
  commitId,
  entries,
  depth,
  prefix,
  dirs,
  onToggle,
  onSelectFile,
}: {
  commitId: string
  entries: TreeEntry[]
  depth: number
  prefix: string
  dirs: Map<string, Loaded>
  onToggle: (path: string) => void
  onSelectFile?: (path: string) => void
}) {
  return (
    <>
      {entries.map((e) => {
        const path = prefix ? `${prefix}/${e.name}` : e.name
        if (e.type === "tree") {
          const open = dirs.has(path)
          const child = dirs.get(path)
          return (
            <Box key={path}>
              <TreeRow
                depth={depth}
                icon={open ? <ExpandMoreIcon sx={{ fontSize: 16 }} /> : <ChevronRightIcon sx={{ fontSize: 16 }} />}
                label={e.name}
                path={path}
                folder
                onClick={() => onToggle(path)}
              />
              {open && child && child.error && (
                <Typography color="error" variant="body2" sx={{ pl: 2 + (depth + 1) * 1.5, fontSize: 12 }} data-testid="commit-file-tree-error">
                  {child.error}
                </Typography>
              )}
              {open && child && !child.error && (
                <Level
                  commitId={commitId}
                  entries={child.entries}
                  depth={depth + 1}
                  prefix={path}
                  dirs={dirs}
                  onToggle={onToggle}
                  onSelectFile={onSelectFile}
                />
              )}
            </Box>
          )
        }
        return (
          <TreeRow
            key={path}
            depth={depth}
            icon={<DescriptionOutlinedIcon sx={{ fontSize: 15 }} />}
            label={e.name}
            path={path}
            onClick={() => onSelectFile?.(path)}
          />
        )
      })}
    </>
  )
}

function TreeRow({
  depth,
  icon,
  label,
  path,
  folder,
  onClick,
}: {
  depth: number
  icon: ReactNode
  label: string
  path: string
  folder?: boolean
  onClick: () => void
}) {
  return (
    <Box
      data-testid="commit-file-tree-row"
      data-path={path}
      data-type={folder ? "tree" : "blob"}
      onClick={onClick}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        pl: 1 + depth * 1.5,
        pr: 1,
        py: 0.25,
        cursor: "pointer",
        "&:hover": { bgcolor: "action.hover" },
      }}
    >
      <Box component="span" sx={{ display: "inline-flex", color: folder ? "text.secondary" : "text.disabled" }}>
        {icon}
      </Box>
      <Typography variant="body2" noWrap sx={{ fontSize: 12.5 }}>
        {label}
      </Typography>
    </Box>
  )
}
