# Frontend UX audit after v0.13.17 — 2026-09-05

Scope: source review and focused Windows Chromium walkthrough, real disposable
repository, light/dark, 1280x800, 100/150% zoom, plus commit captures at 200%
and 800x600. No additional e2e suite runs, per owner instruction. Native and
Linux behavior is not established by these observations.

## 1. Fix the shell at zoom and small sizes (P1, reproduced)

At 150% in a 1280x800 viewport, `#root` and `browse-shell` measure only
853.33x533.33 visual pixels. The rest of the window is empty background.
The Settings rail button is at y=889 with height=51, outside the viewport.
The Commit dialog now fits, but the underlying shell still needs attention.
Evidence: `website/public/assets/ux-audit-shell-dark.png`.

Investigate the viewport compensation in `theme/index.ts`, rail overflow in
`components/CommandRail.tsx`, and available-space measurement in
`hooks/useChromeLayout.ts`. The responsive observer watches the top toolbar,
which is absent in the default rail layout. The expanded command rail and
repository panel therefore compete with the graph without a rail-specific
collapse rule. Base responsiveness on the actual content container, make
commands scroll with Settings pinned, and preserve usable graph space.

## 2. Make settings behavior consistent (P2, source-confirmed)

Appearance, command placement and zoom persist immediately, but identity and
Git config wait for Save; the dialog has a single Cancel button. A user can
change appearance, press Cancel, and keep the change. `SettingsDialog.tsx`
also mixes personal UI preferences with repository Git identity and editor
integration, without naming config scope clearly.

Separate Appearance, Git identity and Tools. Either apply everything on Save,
or clearly label immediate preferences and use Done for that section. State
whether identity changes affect this repository or all repositories. Explain
line-ending choices in ordinary language alongside `core.autocrlf` values.

## 3. Make common actions discoverable (P2, source + visual)

The repository row looks clickable but has an empty handler. Expanded rail
options have chevrons; collapsed options rely on right-click or Shift+F10.
Merge is permanently disabled and occupies a prominent command slot.

Make the repository row a switcher, expose an accessible options affordance
in collapsed mode, and remove or explain unavailable actions. Add a command
palette using the existing command/hotkey catalog so users can find actions
without guessing which context menu contains them.

## 4. Help users find history (next feature)

Ref filtering exists, but the reviewed Browse surface has no obvious global
commit search by message, author or SHA. Add one search field with progressive
filters and clear results/reset state. This improves the app's core graph
workflow more directly than adding more shell customization.

## 5. Complete collaboration workflows (following feature)

Merge remains explicitly unavailable. Prioritize a guarded merge flow and
conflict-resolution workspace: identify conflicted files, open the configured
merge tool, show resolved status, then Continue/Abort with clear consequences.
Reuse the existing operation feedback rather than introducing another job UI.
Clone/init onboarding is useful afterward for new users without a local repo.

## Visual polish

A separate vision reviewer found no clipped Commit/Cancel controls in the
four fixed-dialog captures. Dark disabled labels and placeholders are faint;
clean-repository panels are unnecessarily large and mostly empty. Improve
those after the shell and settings issues. Do not turn audit fixture images
into website showcase images.

## Recommended order

Next iteration: shell sizing/rail reachability + consistent settings + dead
control cleanup. Then commit search/command discovery. Then merge/conflicts.
These are recommendations, not authorization to add features in this release.
