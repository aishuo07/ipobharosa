# Implementation log

## 17 August 2026 — launch data reliability

- Created `codex/launch-data-reliability` from current `origin/main` after the owner approved closing the launch data gaps.
- Replaced boolean GMP/subscription failures with `VALUE`, `NOT_YET_AVAILABLE`, `NOT_COVERED` and `ERROR` outcomes.
- Limited closed-IPO market polling to a two-day finalisation window, added transient retries, truthful source-health counting and partial-regression alerts.
- Added public exact-reason GMP empty states, richer Admin run summaries and exact-IPO reminder deep links.
- Live provider proof correctly separated successful SME quotes, unpublished quotes, non-coverage and an actual unreachable provider.
- Validation: 48 files / 301 tests, zero-warning lint, TypeScript, Production build and Prisma schema validation passed.

## 17 August 2026 — public launch and PWA plan

- Owner approved the written launch and installable-PWA plan.
- Started PR A from current `origin/main` on `codex/launch-foundation`.
- Generated one brand-matched social card for the existing paper/ink/green/orange design system.
- Implemented canonical-origin alignment, metadata, browser headers, safe environment template and Preview origin checks.
- Validation: 42 test files / 282 tests passed, lint passed, TypeScript passed and the Production build completed.
- Local header inspection passed. Full local smoke could not query the configured remote database from this sandbox, so canonical/database-backed route proof remains a Vercel Preview gate.
- PR #53 passed CI, migration smoke, GitGuardian and Vercel checks. Preview smoke verified board/detail responses, fail-closed admin mutation, canonical/robots/sitemap agreement and live security headers.
- Squash-merged PR #53 as `b7500e6`; started the installable-PWA release from that exact `origin/main`.
- Implemented the PWA manifest, branded standard/maskable/Apple icons, service-worker route, install UI and explicit offline page.
- The worker caches only `/offline`, does not intercept API/admin/login/watchlist navigation and removes obsolete app caches on activation.
- PWA validation: 44 test files / 287 tests, lint, TypeScript and Production build passed. Runtime checks confirmed manifest fields/icons, JavaScript content type, root worker scope and offline route.
- PR #54 passed all required checks; Preview smoke passed and Chrome reported zero installability errors. Squash-merged as `f63ba77`.
- Started the monitoring/recovery release from the exact merged PWA main.
- Implemented a privacy-safe public health contract, 15-minute external probe, deduplicated GitHub incident lifecycle and Production operations/restore runbook.
- Monitoring validation: 45 test files / 291 tests, lint, TypeScript, workflow-script syntax and Production build passed. The merged Production monitor completed a real end-to-end health run successfully; its Actions were then upgraded to Node 24-compatible releases to remove the deprecation warning. Isolated Neon restore remains an access-dependent launch gate.

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
# 2026-08-17 — Production discovery resilience

- Added transient retry/backoff to the IPO Watch Mainboard/SME listing fetch.
- Treat HTTP-200 interstitial/schema-drift pages as failures instead of a successful zero-IPO result.
- Normalize relative IPO detail links to trusted absolute `https://ipowatch.in/...` URLs; a live source check exposed this as a concrete cause of missed candidate processing.
- Live adapter proof returned 59 current/recent rows: 28 Mainboard and 31 SME.
# 2026-08-17 — Real-RHP financial layout coverage

- Reproduced the Production extraction gap from the successful scheduled run: `submitted=0 skipped=10 failed=0`.
- Added support for a common real filing layout: `RESTATED STATEMENT OF PROFIT & LOSS`, rupee-lakh units, March year columns, and document-level standalone/consolidated scope only when the filing states one unambiguous scope.
- Added lakh-to-crore normalization in the API workflow.
- Verified against Aastha Spintex's public RHP text: six filing-backed candidates (Revenue + PAT for FY2023–FY2025), page 249, explicit Standalone scope, Restated status. Candidates still enter the review queue; this change does not auto-publish ambiguous financial data.
# 2026-08-17 — Source failures now reach the external monitor

- `/api/health` now includes the last completed ingestion run's real source-pipeline result, not only its age.
- A fresh run containing discovery, filing, drift, reminder, or sustained GMP-source alerts returns degraded health; the 15-minute Production monitor then turns red and opens one deduplicated GitHub incident.
- Malformed/legacy checkpoint JSON remains `unknown` and cannot crash or leak internals through the public health route.
