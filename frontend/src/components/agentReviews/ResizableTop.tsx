import Box from "@mui/material/Box"
import type { SxProps, Theme } from "@mui/material/styles"
import { useRef, useState } from "react"
import { DetailSplit } from "./plan/DetailSplit"
import { readHeight } from "./plan/detailHeight"
import { deskGap } from "../../theme/panels"

// A screen's top panel whose height a handle under it sets (v0.22.3, owner:
// "also in reviews, code review, top panel should be resizeable"). Long
// content scrolls inside; the height is kept per user under storageKey.

export function ResizableTop({
  storageKey,
  defaultHeight = 150,
  testid,
  sx,
  children,
}: {
  storageKey: string
  defaultHeight?: number
  testid: string
  sx: SxProps<Theme>
  children: React.ReactNode
}) {
  const [height, setHeight] = useState(() => readHeight(storageKey, defaultHeight))
  const panel = useRef<HTMLDivElement | null>(null)
  return (
    <>
      <Box
        ref={panel}
        data-testid={testid}
        sx={[...(Array.isArray(sx) ? sx : [sx]), { height, overflow: "auto", flexShrink: 0 }]}
      >
        {children}
      </Box>
      <Box sx={{ mt: `calc(-1 * ${deskGap})`, mb: `calc(-1 * ${deskGap})`, flexShrink: 0 }}>
        <DetailSplit
          height={height}
          onHeight={setHeight}
          grow="down"
          getMax={() => (panel.current?.parentElement?.clientHeight ?? 800) - 260}
          storageKey={storageKey}
          label="Resize the top panel"
          testid={`${testid}-splitter`}
        />
      </Box>
    </>
  )
}
