import Button from "@mui/material/Button"
import Checkbox from "@mui/material/Checkbox"
import FormControlLabel from "@mui/material/FormControlLabel"
import Radio from "@mui/material/Radio"
import RadioGroup from "@mui/material/RadioGroup"
import Typography from "@mui/material/Typography"
import { useEffect, useState } from "react"
import { useActionDialog } from "../../hooks/useActionDialog"
import { OpDialog, OpError } from "./OpDialog"

export function CheckoutBranchDialog({
  open,
  branch,
  branchOptions,
  dirtyCount,
  onClose,
  onConfirm,
}: {
  open: boolean
  branch: string
  branchOptions: string[]
  dirtyCount: number
  onClose: () => void
  onConfirm: (branch: string, force: boolean) => Promise<void>
}) {
  const [selected, setSelected] = useState(branch)
  const [force, setForce] = useState(false)
  const { error, submit } = useActionDialog({
    open,
    label: "checkout",
    action: () => onConfirm(selected, force),
    onClose,
  })

  useEffect(() => {
    if (open) {
      setSelected(branch)
      setForce(false)
    }
  }, [open, branch])

  return (
    <OpDialog
      open={open}
      title="Checkout Branch"
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="contained" onClick={submit} data-testid="checkout-confirm">
            Checkout
          </Button>
        </>
      }
    >
      {dirtyCount > 0 && (
        <Typography variant="body2" color="warning.main">
          The working tree has {dirtyCount} uncommitted change(s). Force checkout will discard them.
        </Typography>
      )}
      <RadioGroup value={selected} onChange={(e) => setSelected(e.target.value)}>
        {branchOptions.map((b) => (
          <FormControlLabel key={b} value={b} control={<Radio size="small" />} label={b} />
        ))}
      </RadioGroup>
      <FormControlLabel
        control={<Checkbox size="small" checked={force} onChange={(e) => setForce(e.target.checked)} />}
        label="Force (discard local changes)"
      />
      <OpError error={error} />
    </OpDialog>
  )
}
