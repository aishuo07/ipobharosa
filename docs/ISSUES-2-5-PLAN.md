# Implementation plan: ingestion reliability and UI refresh

## Approach

Deliver four sequential pull requests. Each starts from the latest `main`, passes lint, tests, build, clean migration smoke, Vercel Preview, and targeted smoke checks before merge.

## Issue #2 — bounded ingestion

- [x] Replace the monolithic cycle with a persisted stage/cursor state in `IngestionRun.summary`.
- [x] Process a small GMP or subscription batch per invocation.
- [x] Commit each data batch and its checkpoint atomically.
- [x] Record the current stage, cursor, attempts, and last error for operators.
- [x] Update GitHub Actions to continue until the route reports completion.
- [x] Add state-machine and retry tests, then prove three Development cycles.

## Issue #3 — design-system foundation

- [x] Define semantic colour, type, spacing, radius, shadow, motion, focus, and responsive tokens.
- [x] Add reusable button, badge, tabs, input, card, panel, table, and state components.
- [x] Cover keyboard, disabled, loading, empty, error, and reduced-motion behavior.

## Issue #4 — Board

- [x] Recompose Board navigation, filters, cards, compare, and calendar using shared primitives.
- [x] Preserve data and interaction parity.
- [x] Verify no overflow and capture Preview evidence at 360, 390, 768, 1024, and 1440 pixels.

## Issue #5 — IPO Detail

- [x] Recompose detail header, overview, lifecycle, subscription, GMP, financials, documents, and provenance.
- [x] Make official and unofficial evidence visually distinct.
- [x] Verify long labels, empty states, keyboard/focus, reduced motion, and all target widths.

## Rollback

Each issue is isolated in its own pull request. Ingestion uses the existing lock and run table; an interrupted batch keeps its previous cursor and is safe to retry. UI changes do not alter stored data and can be reverted independently.
