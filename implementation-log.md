# Implementation log

## PR 6 — public correctness, trust contract and date board

- [DONE] Owner approved the expanded Production-closure plan.
- [DONE] Added the requested Today-first date-board behaviour to the approved PR 6 scope.
- [DONE] Created `codex/prod-correctness-calendar` from current `origin/main`.
- [DONE] Added failing tests for market dates, lifecycle, verification and calendar ordering.
- [DONE] Implemented shared India-market date formatting and listing-date lifecycle correction.
- [DONE] Bound Verified labels to complete official field-match evidence.
- [DONE] Scoped single-IPO Google feeds and corrected missing-filing calls to action.
- [DONE] Implemented the prominent Dates tab, Today-first coloured date board, selected-day agenda and cross-month upcoming stream.
- [DONE] Added a copyable live feed fallback with accurate Google desktop instructions.
- [DONE] Corrected card/login accessibility semantics.
- [DONE] Passed 41 focused tests and TypeScript.
- [DONE] Passed all 265 Vitest tests, lint, Production build, Prisma validation and 10 Python tests.
- [BLOCKED] Local visual rendering cannot reach the remote database from this environment; use the Vercel Preview for responsive/browser evidence.
- [DONE] Pushed PR #46; CI, migration smoke test and the first Vercel Preview passed.
- [DONE] Browser-verified the desktop and 390 px mobile date board, chronological event stream, event-type colours, scoped calendar links and corrected listing lifecycle.
- [DONE] Isolated the remaining detail-page hydration failure to React 19 hoisting empty SVG `title` nodes during SSR; replaced those nodes with hydration-safe accessible point labels.
- [DONE] Re-ran all 265 Vitest tests, lint, TypeScript and the Production build after the hydration fix.
- [DONE] Updated Vercel Preview and every required PR check passed; a fresh browser session confirmed the IPO detail page now hydrates with zero console errors.
- [ ] Merge PR #46 and smoke-test the exact commit in Production.
