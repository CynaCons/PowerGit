import Button from "@mui/material/Button"
import TextField from "@mui/material/TextField"
import { useEffect, useState } from "react"
import { useActionDialog } from "../../hooks/useActionDialog"
import { OpDialog, OpError } from "./OpDialog"

export function CreateRefDialog({
  open,
  kind,
  commit,
  subject,
  existingNames,
  onClose,
  onConfirm,
}: {
  open: boolean
  kind: "branch" | "tag"
  commit: string
  subject?: string
  existingNames: string[]
  onClose: () => void
  onConfirm: (name: string) => Promise<void>
}) {
  const [name, setName] = useState("")
  const { error, setError, submit } = useActionDialog({
    open,
    label: `create ${kind}`,
    action: () => onConfirm(name.trim()),
    onClose,
  })

  useEffect(() => {
    if (open) setName("")
  }, [open])

  async function run() {
    const clean = name.trim()
    if (!clean) {
      setError(`A ${kind} name is required.`)
      return
    }
    if (existingNames.includes(clean)) {
      setError(`'${clean}' already exists.`)
      return
    }
    await submit()
  }

  return (
    <OpDialog
      open={open}
      title={`Create ${kind} at ${commit.slice(0, 7)}${subject ? ` (${subject})` : ""}`}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="contained" onClick={run} data-testid="create-ref-confirm">
            Create {kind}
          </Button>
        </>
      }
    >
      <TextField
        autoFocus
        fullWidth
        size="small"
        label={`${kind === "branch" ? "Branch" : "Tag"} name`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void run()
        }}
        data-testid="create-ref-name"
      />
      <OpError error={error} />
    </OpDialog>
  )
}
