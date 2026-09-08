import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward"
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Dialog from "@mui/material/Dialog"
import DialogActions from "@mui/material/DialogActions"
import DialogContent from "@mui/material/DialogContent"
import DialogTitle from "@mui/material/DialogTitle"
import IconButton from "@mui/material/IconButton"
import TextField from "@mui/material/TextField"
import Typography from "@mui/material/Typography"
import { useEffect, useState } from "react"
import type { RebaseTodo, RebaseTodoEntry } from "../../engine"
import { useActionDialog } from "../../hooks/useActionDialog"
import { MONO_FONT } from "../../theme"
import { OpError } from "./OpDialog"
import {
  ACTION_LABELS,
  TODO_ACTIONS,
  canMove,
  move,
  setAction,
  setMessage,
  summarize,
  toEntries,
  toRows,
  validate,
  type TodoAction,
  type TodoRow,
} from "./rebase/todoModel"

// Git Extensions' interactive-rebase todo editor. git wrote the plan (the
// engine captured it with GIT_SEQUENCE_EDITOR); this dialog only changes
// what GE lets you change — the action per commit, a new message for reword
// and squash, and the order — and hands the list back for the engine to run.

export function InteractiveRebaseDialog({
  open,
  todo,
  ontoSubject,
  currentBranch,
  onClose,
  onConfirm,
}: {
  open: boolean
  todo: RebaseTodo
  ontoSubject?: string
  currentBranch: string
  onClose: () => void
  onConfirm: (entries: RebaseTodoEntry[]) => Promise<void>
}) {
  const [rows, setRows] = useState<TodoRow[]>(() => toRows(todo))

  useEffect(() => {
    if (open) setRows(toRows(todo))
  }, [open, todo])

  const problem = validate(rows)
  const { busy, error, setError, submit } = useActionDialog({
    open,
    label: "rebase",
    action: () => onConfirm(toEntries(rows)),
    onClose,
  })

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth data-testid="interactive-rebase-dialog">
      <DialogTitle sx={{ fontSize: 15 }}>
        {`Rebase '${todo.headName || currentBranch}' onto ${todo.onto.slice(0, 7)}${ontoSubject ? ` (${ontoSubject})` : ""}`}
      </DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 0.5, minHeight: 280 }}>
        <Typography variant="caption" color="text.secondary">
          The list runs top to bottom — the oldest commit first, as git writes it.
        </Typography>
        <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, overflow: "auto", maxHeight: 380 }}>
          {rows.map((row) => (
            <Box key={row.id} data-testid="todo-row" data-sha={row.sha ?? ""} data-action={row.action}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 1, py: 0.5 }}>
                {row.commit ? (
                  <TextField
                    select
                    size="small"
                    value={row.action}
                    onChange={(e) => setRows((r) => setAction(r, row.id, e.target.value as TodoAction))}
                    sx={{ width: 120 }}
                    slotProps={{ select: { native: true }, htmlInput: { "data-testid": "todo-action" } }}
                  >
                    {TODO_ACTIONS.map((a) => (
                      <option key={a} value={a} title={ACTION_LABELS[a]}>
                        {ACTION_LABELS[a].split(" — ")[0]}
                      </option>
                    ))}
                  </TextField>
                ) : (
                  <Typography
                    data-testid="todo-raw"
                    sx={{ width: 120, fontFamily: MONO_FONT, fontSize: 12, color: "text.disabled" }}
                    noWrap
                  >
                    {row.rawAction}
                  </Typography>
                )}
                <Typography sx={{ fontFamily: MONO_FONT, fontSize: 12, color: "text.secondary", width: 62 }} noWrap>
                  {row.sha?.slice(0, 7) ?? ""}
                </Typography>
                <Typography
                  sx={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 12.5,
                    textDecoration: row.action === "drop" && row.commit ? "line-through" : undefined,
                    color: row.commit ? "text.primary" : "text.disabled",
                  }}
                  noWrap
                >
                  {row.subject ?? row.raw}
                </Typography>
                <IconButton
                  size="small"
                  data-testid="todo-up"
                  aria-label="Move up"
                  disabled={!canMove(rows, row.id, -1)}
                  onClick={() => setRows((r) => move(r, row.id, -1))}
                >
                  <ArrowUpwardIcon fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  data-testid="todo-down"
                  aria-label="Move down"
                  disabled={!canMove(rows, row.id, 1)}
                  onClick={() => setRows((r) => move(r, row.id, 1))}
                >
                  <ArrowDownwardIcon fontSize="small" />
                </IconButton>
              </Box>
              {row.commit && (row.action === "reword" || row.action === "squash") && (
                <Box sx={{ px: 1, pb: 0.75, pl: 16 }}>
                  <TextField
                    fullWidth
                    size="small"
                    multiline
                    maxRows={4}
                    placeholder={row.action === "reword" ? "New commit message" : "Message of the squashed commit"}
                    value={row.message ?? ""}
                    onChange={(e) => setRows((r) => setMessage(r, row.id, e.target.value))}
                    slotProps={{ htmlInput: { "data-testid": "todo-message" } }}
                  />
                </Box>
              )}
            </Box>
          ))}
        </Box>
        <Typography variant="caption" color="text.secondary" data-testid="todo-summary">
          {summarize(rows)}
        </Typography>
        {problem && (
          <Typography variant="body2" color="error" data-testid="todo-problem">
            {problem}
          </Typography>
        )}
        <OpError error={error} />
      </DialogContent>
      <DialogActions>
        <Button size="small" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          size="small"
          variant="contained"
          data-testid="irebase-confirm"
          disabled={busy || problem !== null}
          onClick={() => {
            setError(null)
            void submit()
          }}
        >
          {busy ? "Rebasing…" : "Start rebase"}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
