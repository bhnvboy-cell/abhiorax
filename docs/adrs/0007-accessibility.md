# ADR-0007: WCAG AAA Accessibility as Release Gate

**Status:** Accepted · **Date:** 2026-08-09

## Decision
- All UI must meet **WCAG 2.2 AAA** (contrast ≥ 7:1, no time limits, enhanced focus,
  sign-language/full-text alternatives where possible, semantics first).
- A **runtime accessibility engine** records component compliance metadata and surfaces
  violations to an internal dashboard (`/api/accessibility/report`).
- CI runs `axe-core` (with AAA rules enabled) + storybook a11y snapshots; **merge blocked
  on any AAA violation**.
- Every route ships `lang`, `dir`, skip-links, focus traps, and reduced-motion support.

## Consequence
- Design tokens enforce AAA-safe color pairs; legacy low-contrast UI is automatically flagged.
