import Box from "@mui/material/Box"
import Card from "@mui/material/Card"
import CardActionArea from "@mui/material/CardActionArea"
import CardContent from "@mui/material/CardContent"
import Dialog from "@mui/material/Dialog"
import DialogTitle from "@mui/material/DialogTitle"
import Typography from "@mui/material/Typography"
import type { RepoInfo } from "../engine"

type Props = {
  open: boolean
  onClose: () => void
  recents: RepoInfo[]
  onPick: (path: string) => void
}

export function RecentsDialog({ open, onClose, recents, onPick }: Props) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Recent repositories</DialogTitle>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2, p: 2 }}>
        {recents.length === 0 && <Typography color="text.secondary">No recent repositories yet.</Typography>}
        {recents.map((r) => (
          <Card key={r.root} variant="outlined">
            <CardActionArea
              onClick={() => {
                onPick(r.root)
                onClose()
              }}
            >
              <CardContent>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  {r.name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {r.branch}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block", mt: 0.5, wordBreak: "break-all" }}
                >
                  {r.root}
                </Typography>
              </CardContent>
            </CardActionArea>
          </Card>
        ))}
      </Box>
    </Dialog>
  )
}
