import CallSplitIcon from "@mui/icons-material/CallSplit"
import ChevronRightIcon from "@mui/icons-material/ChevronRight"
import CloudOutlinedIcon from "@mui/icons-material/CloudOutlined"
import ExpandMoreIcon from "@mui/icons-material/ExpandMore"
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined"
import SellOutlinedIcon from "@mui/icons-material/SellOutlined"
import Box from "@mui/material/Box"
import Typography from "@mui/material/Typography"
import type { ReactNode } from "react"

// Row primitives for RepoTree: one flat Item per visible line, drawn either
// as a section header or a tree row. The tree model lives in RepoTree.tsx.
export type Item = {
  key: string
  section?: string
  depth: number
  label: string
  count?: number
  icon?: "branch" | "remote" | "tag" | "submodule"
  expandable?: boolean
  open?: boolean
  current?: boolean
  muted?: boolean
  onClick: () => void
  onContext?: (x: number, y: number) => void
}

// Uniform row geometry for every node in the tree:
// [padding-left 6 + 16*depth][16px chevron slot][16px icon slot][label]
export const TREE_ROW_INDENT = 6
export const TREE_ROW_LEVEL = 16

export const ROW_HEIGHT = 22
export const SECTION_HEIGHT = 28

const ICONS: Record<NonNullable<Item["icon"]>, ReactNode> = {
  branch: <CallSplitIcon sx={{ fontSize: 13 }} />,
  remote: <CloudOutlinedIcon sx={{ fontSize: 13 }} />,
  tag: <SellOutlinedIcon sx={{ fontSize: 12 }} />,
  submodule: <FolderOutlinedIcon sx={{ fontSize: 13 }} />,
}

export function SectionHeader({ item, style }: { item: Item; style: React.CSSProperties }) {
  return (
    <Box
      data-testid={`tree-section-${item.label.toLowerCase()}`}
      onClick={item.onClick}
      style={style}
      sx={{
        display: "flex",
        alignItems: "center",
        cursor: "pointer",
        userSelect: "none",
        height: `${SECTION_HEIGHT}px`,
        lineHeight: `${SECTION_HEIGHT}px`,
        pl: `${TREE_ROW_INDENT}px`,
        fontSize: 12,
        fontWeight: 500,
        color: "text.secondary",
        bgcolor: "background.paper",
        "&:hover": { color: "text.primary" },
      }}
    >
      <Box component="span" sx={{ display: "inline-flex", width: 16, justifyContent: "center", mr: 0.5 }}>
        {item.open ? <ExpandMoreIcon sx={{ fontSize: 15 }} /> : <ChevronRightIcon sx={{ fontSize: 15 }} />}
      </Box>
      {item.label}
      {item.count !== undefined && (
        <Box component="span" sx={{ ml: 0.5, fontWeight: 400 }}>
          ({item.count})
        </Box>
      )}
    </Box>
  )
}

export function TreeRow({ item, style }: { item: Item; style: React.CSSProperties }) {
  return (
    <Box
      data-testid="tree-row"
      data-depth={item.depth}
      data-label={item.label}
      onClick={item.onClick}
      onContextMenu={
        item.onContext
          ? (e) => {
              e.preventDefault()
              item.onContext!(e.clientX, e.clientY)
            }
          : undefined
      }
      style={style}
      sx={{
        display: "flex",
        alignItems: "center",
        height: `${ROW_HEIGHT}px`,
        pl: `${TREE_ROW_INDENT + item.depth * TREE_ROW_LEVEL}px`,
        pr: 1,
        cursor: "default",
        bgcolor: item.current ? "action.selected" : "transparent",
        "&:hover": { bgcolor: "action.hover" },
      }}
    >
      <Box component="span" sx={{ width: 16, flexShrink: 0, display: "inline-flex", justifyContent: "center" }}>
        {item.expandable ? (
          item.open ? (
            <ExpandMoreIcon sx={{ fontSize: 15 }} />
          ) : (
            <ChevronRightIcon sx={{ fontSize: 15 }} />
          )
        ) : null}
      </Box>
      <Box
        component="span"
        sx={{
          width: 16,
          flexShrink: 0,
          display: "inline-flex",
          justifyContent: "center",
          mr: 0.5,
          color: item.current ? "primary.main" : "text.secondary",
        }}
      >
        {item.icon ? ICONS[item.icon] : null}
      </Box>
      <Typography
        variant="body2"
        noWrap
        sx={{
          fontSize: 12.5,
          fontWeight: item.current ? 700 : 400,
          color: item.current ? "primary.main" : item.muted ? "text.secondary" : "text.primary",
        }}
      >
        {item.label}
        {item.count !== undefined ? ` (${item.count})` : ""}
      </Typography>
    </Box>
  )
}
