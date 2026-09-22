import ContentCopyIcon from "@mui/icons-material/ContentCopy"
import FolderOpenIcon from "@mui/icons-material/FolderOpen"
import TerminalIcon from "@mui/icons-material/Terminal"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import IconButton from "@mui/material/IconButton"
import Typography from "@mui/material/Typography"
import type { RecentInfo, RepoPeek } from "../engine"
import { MONO_FONT } from "../theme"
import { Kbd } from "./Kbd"
import { relativeTime } from "./startPaneModel"

type Props = {
  repo: RecentInfo | null
  peek: RepoPeek | null
  current: boolean
  onOpen: (root: string) => void
  onForget: (repo: RecentInfo) => void
  onTerminal: (root: string) => void
  onCopyPath: (root: string) => void
}

export function StartPaneDetail({ repo, peek, current, onOpen, onForget, onTerminal, onCopyPath }: Props) {
  if (!repo)
    return (
      <Box data-testid="start-detail" sx={{ m: "auto", color: "text.secondary" }}>
        Select a repository.
      </Box>
    )
  return (
    <Box
      data-testid="start-detail"
      sx={{ minHeight: 0, overflow: "auto", px: 3.75, pt: 3.25, display: "flex", flexDirection: "column" }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
        <Typography component="h2" sx={{ fontSize: 23, lineHeight: 1.3, fontWeight: 600, letterSpacing: "-.01em" }}>
          {repo.name}
        </Typography>
        {(peek?.branch ?? repo.branch) && (
          <Box component="span" className="ref">
            {peek?.branch ?? repo.branch}
          </Box>
        )}
        {current && <Box sx={{ color: "text.secondary", fontSize: 12 }}>open now</Box>}
      </Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1.25 }}>
        <Box
          data-testid="start-detail-path"
          title={repo.root}
          sx={{
            fontFamily: MONO_FONT,
            fontSize: 12.5,
            color: "text.secondary",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {repo.root}
        </Box>
        <IconButton
          data-testid="start-copy-path"
          aria-label="Copy path"
          onClick={() => onCopyPath(repo.root)}
          size="small"
          sx={{ color: "text.secondary" }}
        >
          <ContentCopyIcon sx={{ fontSize: 15 }} />
        </IconButton>
      </Box>
      <Box
        sx={{ display: "flex", gap: 2.75, mt: 2.25, py: 1.5, borderTop: 1, borderBottom: 1, borderColor: "divider" }}
      >
        <Fact label="Working tree" value={peek?.changed ? `${peek.changed} changed` : "clean"} />
        <Fact label="To push" value={peek?.ahead ? String(peek.ahead) : "—"} />
        <Fact label="To pull" value={peek?.behind ? String(peek.behind) : "—"} />
        <Fact label="Last opened" value={relativeTime(repo.lastOpened)} />
      </Box>
      <Box data-testid="start-history" sx={{ mt: 2 }}>
        <Typography
          sx={{
            fontSize: 11,
            letterSpacing: ".05em",
            textTransform: "uppercase",
            color: "text.secondary",
            mb: 1,
            fontWeight: 600,
          }}
        >
          Recent history
        </Typography>
        {peek?.commits?.slice(0, 8).map((commit, index, commits) => (
          <Box
            key={commit.sha}
            sx={{
              display: "grid",
              gridTemplateColumns: "16px 1fr auto",
              alignItems: "center",
              columnGap: 1.5,
              height: 26,
            }}
          >
            <Box
              sx={{
                height: 26,
                width: 16,
                position: "relative",
                "&::before": {
                  content: '""',
                  position: "absolute",
                  left: 7,
                  top: index === 0 ? 13 : 0,
                  bottom: index === commits.length - 1 ? 13 : 0,
                  width: 2,
                  bgcolor: "primary.main",
                  opacity: 0.35,
                },
                "&::after": {
                  content: '""',
                  position: "absolute",
                  left: 4,
                  top: 10,
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  bgcolor: "primary.main",
                },
              }}
            />
            <Box
              sx={{
                fontSize: 13,
                color: "text.secondary",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {commit.subject}
            </Box>
            <Box sx={{ fontSize: 11.5, color: "text.disabled", fontFamily: MONO_FONT }}>
              {relativeTime(commit.date)}
            </Box>
          </Box>
        ))}
      </Box>
      <Box
        sx={{
          mt: "auto",
          py: 2,
          borderTop: 1,
          borderColor: "divider",
          display: "flex",
          alignItems: "center",
          gap: 1.25,
        }}
      >
        <Button
          data-testid="start-open"
          variant="contained"
          startIcon={<FolderOpenIcon />}
          onClick={() => onOpen(repo.root)}
        >
          Open
        </Button>
        <Button
          data-testid="start-terminal"
          variant="outlined"
          startIcon={<TerminalIcon />}
          onClick={() => onTerminal(repo.root)}
        >
          Terminal here
        </Button>
        <Button data-testid="start-forget" color="inherit" onClick={() => onForget(repo)}>
          Remove from recents
        </Button>
        <Box sx={{ flex: 1 }} />
        <Box sx={{ color: "text.secondary", fontSize: 12, whiteSpace: "nowrap" }}>
          <Kbd>↑</Kbd> <Kbd>↓</Kbd> move · <Kbd>Enter</Kbd> open
        </Box>
      </Box>
    </Box>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Box sx={{ fontSize: 11, letterSpacing: ".05em", textTransform: "uppercase", color: "text.secondary" }}>
        {label}
      </Box>
      <Box sx={{ mt: "3px", fontFamily: MONO_FONT, fontSize: 15, fontWeight: 600 }}>{value}</Box>
    </Box>
  )
}
