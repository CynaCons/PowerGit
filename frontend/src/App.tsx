import AddIcon from "@mui/icons-material/Add"
import HistoryIcon from "@mui/icons-material/History"
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined"
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined"
import CloudDownloadOutlinedIcon from "@mui/icons-material/CloudDownloadOutlined"
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined"
import CallReceivedOutlinedIcon from "@mui/icons-material/CallReceivedOutlined"
import AppBar from "@mui/material/AppBar"
import Badge from "@mui/material/Badge"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Dialog from "@mui/material/Dialog"
import DialogActions from "@mui/material/DialogActions"
import DialogContent from "@mui/material/DialogContent"
import DialogTitle from "@mui/material/DialogTitle"
import IconButton from "@mui/material/IconButton"
import List from "@mui/material/List"
import ListItemButton from "@mui/material/ListItemButton"
import ListItemText from "@mui/material/ListItemText"
import TextField from "@mui/material/TextField"
import Toolbar from "@mui/material/Toolbar"
import Tooltip from "@mui/material/Tooltip"
import Typography from "@mui/material/Typography"
import { useCallback, useEffect, useMemo, useState } from "react"
import { BottomPanel } from "./components/BottomPanel"
import { RecentsDialog } from "./components/RecentsDialog"
import { RepoTree } from "./components/RepoTree"
import { RevisionGrid } from "./components/RevisionGrid"
import { SettingsDialog } from "./components/SettingsDialog"
import {
  createCommit,
  fetchCurrent,
  fetchHealth,
  fetchRecents,
  fetchRefs,
  fetchRevisions,
  fetchStatus,
  openRepo,
  stagePaths,
  type Health,
  type RefTree,
  type RepoInfo,
  type RepoStatus,
  type RevisionDto,
} from "./engine"
import { layoutGraph } from "./graph/layout"
import { syntheticHistory } from "./graph/synthetic"
import type { Revision } from "./graph/types"

function toRevision(dto: RevisionDto): Revision {
  return {
    id: dto.id,
    parents: dto.parents,
    message: dto.subject,
    author: dto.author,
    date: dto.date.replace("T", " ").slice(0, 16),
    refs: dto.refs,
  }
}

export default function App() {
  const [revisions, setRevisions] = useState<Revision[]>(() => syntheticHistory(200).map((r) => ({ ...r, id: r.id.length >= 7 ? r.id : r.id.padEnd(7, "0") })))
  const [selected, setSelected] = useState(0)
  const [commitOpen, setCommitOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [recentsOpen, setRecentsOpen] = useState(false)
  const [health, setHealth] = useState<Health | null>(null)
  const [repo, setRepo] = useState<RepoInfo | null>(null)
  const [engineError, setEngineError] = useState<string | null>(null)
  const [refs, setRefs] = useState<RefTree | null>(null)
  const [status, setStatus] = useState<RepoStatus | null>(null)
  const [recents, setRecents] = useState<RepoInfo[]>([])
  const [message, setMessage] = useState("")
  const [live, setLive] = useState(false)

  const rows = useMemo(() => layoutGraph(revisions), [revisions])
  const current = rows[selected]
  const dirty = (status?.unstagedCount ?? 0) + (status?.stagedCount ?? 0)

  const refreshRepo = useCallback(async () => {
    const [rev, tree, st] = await Promise.all([fetchRevisions(800), fetchRefs(), fetchStatus()])
    setRevisions(rev.map(toRevision))
    setRefs(tree)
    setStatus(st)
    setSelected(0)
    setLive(true)
  }, [])

  useEffect(() => {
    const ctrl = new AbortController()
    fetchHealth(ctrl.signal)
      .then(async (h) => {
        setHealth(h)
        setEngineError(null)
        const currentRepo = await fetchCurrent()
        if (currentRepo) setRepo(currentRepo)
        try {
          await refreshRepo()
          setRecents(await fetchRecents())
        } catch {
          setLive(false)
        }
      })
      .catch((err: unknown) => {
        setHealth(null)
        setEngineError(err instanceof Error ? err.message : "engine offline")
      })
    return () => ctrl.abort()
  }, [refreshRepo])

  async function onOpenFolder(path?: string) {
    const target = path ?? window.prompt("Open repository path")
    if (!target) return
    try {
      const info = await openRepo(target)
      setRepo(info)
      setEngineError(null)
      await refreshRepo()
      setRecents(await fetchRecents())
    } catch (err) {
      setEngineError(err instanceof Error ? err.message : "open failed")
    }
  }

  function onSelectTarget(sha: string) {
    const idx = rows.findIndex((r) => r.rev.id.startsWith(sha) || sha.startsWith(r.rev.id))
    if (idx >= 0) setSelected(idx)
  }

  async function onCommit() {
    if (!message.trim() || !status?.stagedCount) return
    await createCommit(message.trim())
    setMessage("")
    setCommitOpen(false)
    await refreshRepo()
  }

  return (
    <Box data-testid="browse-shell" sx={{ display: "flex", height: "100%", bgcolor: "background.default" }}>
      <Box
        component="nav"
        data-testid="navrail"
        aria-label="Repositories"
        sx={{
          width: 64,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          py: 1.5,
          gap: 0.5,
          bgcolor: "background.paper",
          borderRight: 1,
          borderColor: "divider",
        }}
      >
        <Tooltip title={repo?.name ?? "PowerGit"} placement="right">
          <IconButton color="primary" sx={{ borderRadius: 2, bgcolor: "primary.main", color: "#fff", "&:hover": { bgcolor: "primary.dark" } }}>
            <AccountTreeOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Recent repositories" placement="right">
          <IconButton onClick={() => setRecentsOpen(true)} sx={{ borderRadius: 2 }}>
            <HistoryIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Settings" placement="right">
          <IconButton onClick={() => setSettingsOpen(true)} sx={{ borderRadius: 2 }} data-testid="settings-button">
            <SettingsOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Open repository" placement="right">
          <IconButton onClick={() => onOpenFolder()} sx={{ borderRadius: 2 }}>
            <AddIcon />
          </IconButton>
        </Tooltip>
      </Box>

      <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <AppBar position="static" color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: "divider" }}>
          <Toolbar variant="dense" data-testid="toolbar" sx={{ gap: 1, minHeight: 56, px: 2 }}>
            <Typography variant="subtitle1" sx={{ mr: 1, fontWeight: 700 }}>
              PowerGit
            </Typography>
            <Badge
              badgeContent={dirty || 0}
              color="primary"
              overlap="rectangular"
              sx={{ "& .MuiBadge-badge": { fontSize: 10, minWidth: 16, height: 16, px: 0.5 } }}
            >
              <Button variant="contained" size="small" data-testid="commit-button" onClick={() => setCommitOpen(true)}>
                Commit
              </Button>
            </Badge>
            <Button size="small" startIcon={<CloudDownloadOutlinedIcon />} disabled>
              Fetch
            </Button>
            <Button size="small" startIcon={<CallReceivedOutlinedIcon />} disabled>
              Pull
            </Button>
            <Button size="small" startIcon={<CloudUploadOutlinedIcon />} disabled>
              Push
            </Button>
            <Typography data-testid="engine-status" variant="caption" color="text.secondary" sx={{ ml: "auto" }}>
              {health ? `${health.gitVersion} · engine ${health.engine}${live ? "" : " · synthetic"}` : (engineError ?? "engine offline")}
              {repo ? ` · ${repo.name} (${repo.branch})` : ""}
            </Typography>
          </Toolbar>
        </AppBar>

        <Box sx={{ flex: 1, minHeight: 0, p: 1.5, display: "flex", gap: 1.5 }}>
          <RepoTree tree={refs} onSelectTarget={onSelectTarget} />
          <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1.5 }}>
            <Box sx={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }} component="div">
              <Box sx={{ flex: 1, minHeight: 0, display: "flex", bgcolor: "background.paper", border: 1, borderColor: "divider", borderRadius: 3, overflow: "hidden" }}>
                <RevisionGrid rows={rows} selected={selected} onSelect={setSelected} />
              </Box>
            </Box>
            <BottomPanel current={current} />
          </Box>
        </Box>
      </Box>

      <Dialog open={commitOpen} onClose={() => setCommitOpen(false)} fullWidth maxWidth="md">
        <Box data-testid="commit-overlay">
          <DialogTitle>Commit</DialogTitle>
          <DialogContent sx={{ display: "flex", gap: 2, minHeight: 280 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary">
                Unstaged ({status?.unstagedCount ?? 0})
              </Typography>
              <List dense sx={{ maxHeight: 180, overflow: "auto", border: 1, borderColor: "divider", borderRadius: 1 }}>
                {(status?.unstaged ?? []).map((f) => (
                  <ListItemButton key={f.path} onClick={() => stagePaths([f.path]).then(setStatus)}>
                    <ListItemText primary={f.path} secondary={f.status} />
                  </ListItemButton>
                ))}
              </List>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
                Staged ({status?.stagedCount ?? 0}) — click unstaged to stage
              </Typography>
              <List dense sx={{ maxHeight: 180, overflow: "auto", border: 1, borderColor: "divider", borderRadius: 1 }}>
                {(status?.staged ?? []).map((f) => (
                  <ListItemButton key={f.path} onClick={() => stagePaths([f.path], true).then(setStatus)}>
                    <ListItemText primary={f.path} secondary={f.status} />
                  </ListItemButton>
                ))}
              </List>
            </Box>
            <TextField
              autoFocus
              fullWidth
              multiline
              minRows={10}
              placeholder="Commit message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setCommitOpen(false)}>Cancel</Button>
            <Button variant="contained" disabled={!message.trim() || !status?.stagedCount} onClick={onCommit}>
              Commit
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <RecentsDialog open={recentsOpen} onClose={() => setRecentsOpen(false)} recents={recents} onPick={(p) => onOpenFolder(p)} />
    </Box>
  )
}
