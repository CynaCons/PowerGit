import Box from "@mui/material/Box"
import ButtonBase from "@mui/material/ButtonBase"
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { SETTINGS_CATALOG, isShown, sectionShown, type SettingId } from "./settingsCatalog"

// The contents column and the list it scrolls (v0.18.0). An entry per
// visible section, a sub-entry per row with an anchor; a click scrolls
// the list to it, and the section nearest the top of the list is the one
// highlighted. Both read the catalog, so a section the search emptied
// loses its entries with it.

type Props = { visible: Set<SettingId> | null; children: ReactNode }

const TOP_SLACK = 40

export function SettingsToc({ visible, children }: Props) {
  const listRef = useRef<HTMLDivElement | null>(null)
  const [active, setActive] = useState<string>(SETTINGS_CATALOG[0].id)
  const sections = SETTINGS_CATALOG.filter((s) => sectionShown(visible, s.id))

  // The last section whose top has scrolled past the list's top (with a
  // little slack) is the one in view; before any has, the first.
  const mark = useCallback(() => {
    const list = listRef.current
    if (!list) return
    const top = list.getBoundingClientRect().top
    let current: string | null = null
    for (const el of list.querySelectorAll<HTMLElement>("section[id^='settings-']")) {
      if (current === null || el.getBoundingClientRect().top - top <= TOP_SLACK)
        current = el.id.slice("settings-".length)
    }
    if (current) setActive(current)
  }, [])
  // The search changes what is on the list: start it from the top again,
  // then re-mark what is in view.
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0
    mark()
  }, [mark, visible])

  const jump = (elementId: string) => {
    const el = listRef.current?.querySelector<HTMLElement>(`#${CSS.escape(elementId)}`)
    el?.scrollIntoView({ block: "start" })
  }

  const entrySx = (on: boolean, sub: boolean) => ({
    display: "block",
    width: "100%",
    textAlign: "left" as const,
    py: 0.625,
    pr: 2.5,
    pl: sub ? 4 : 2.25,
    fontSize: sub ? 12 : 13.5,
    fontWeight: on ? 600 : 500,
    color: on ? "primary.main" : sub ? "text.secondary" : "text.primary",
    borderLeft: 2,
    borderColor: on ? "primary.main" : "transparent",
    "&:hover": { bgcolor: "var(--pg-grid-hover)" },
  })

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: "flex" }}>
      <Box
        component="nav"
        data-testid="settings-toc"
        aria-label="Settings contents"
        sx={{
          width: 190,
          flexShrink: 0,
          py: 1.75,
          overflow: "auto",
          borderRight: 1,
          borderColor: "var(--pg-border-soft)",
        }}
      >
        {sections.map((s) => (
          <Box key={s.id}>
            <ButtonBase
              data-testid={`settings-toc-${s.id}`}
              aria-current={active === s.id ? "true" : undefined}
              onClick={() => jump(`settings-${s.id}`)}
              sx={entrySx(active === s.id, false)}
            >
              {s.title}
            </ButtonBase>
            {s.rows
              .filter((r) => r.anchor && isShown(visible, r.id))
              .map((r) => (
                <ButtonBase
                  key={r.id}
                  data-testid={`settings-toc-${r.id}`}
                  onClick={() => jump(`setting-${r.id}`)}
                  sx={entrySx(false, true)}
                >
                  {r.anchor}
                </ButtonBase>
              ))}
          </Box>
        ))}
      </Box>
      <Box
        ref={listRef}
        data-testid="settings-list"
        onScroll={mark}
        sx={{
          flex: 1,
          minWidth: 0,
          overflow: "auto",
          pt: 1,
          pr: 4,
          pb: 7.5,
          pl: 3.25,
          // Room above a section or row the contents column scrolled to.
          "& section, & [id^='setting-']": { scrollMarginTop: 8 },
        }}
      >
        {children}
      </Box>
    </Box>
  )
}
