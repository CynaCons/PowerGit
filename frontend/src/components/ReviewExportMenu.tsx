import Menu from "@mui/material/Menu"
import MenuItem from "@mui/material/MenuItem"

export function ReviewExportMenu({
  anchor,
  onClose,
  onMarkdown,
  onJson,
  onShow,
  onSaveMarkdown,
  onSaveJson,
}: {
  anchor: HTMLElement | null
  onClose: () => void
  onMarkdown: () => void
  onJson: () => void
  onShow: () => void
  onSaveMarkdown: () => void
  onSaveJson: () => void
}) {
  const item = (testid: string, label: string, action: () => void) => (
    <MenuItem
      data-testid={testid}
      onClick={() => {
        onClose()
        action()
      }}
    >
      {label}
    </MenuItem>
  )
  return (
    <Menu data-testid="review-export-menu" anchorEl={anchor} open={Boolean(anchor)} onClose={onClose}>
      {item("review-export-md", "Copy as Markdown", onMarkdown)}
      {item("review-export-json", "Copy JSON", onJson)}
      {item("review-export-show", "Show review file", onShow)}
      {item("review-export-save-md", "Save as Markdown…", onSaveMarkdown)}
      {item("review-export-save-json", "Save as JSON…", onSaveJson)}
    </Menu>
  )
}
