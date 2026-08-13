# Implementation log

## 2026-08-13 — coverage architecture

- Split official filing coverage from application-ready IPO records with `IpoFilingCatalogue`.
- Added the SEBI DRHP/RHP adapter and supported public pagination contract.
- Added ingestion persistence, issuer linking, non-fatal source health reporting, and a migration-safe cached read-through fallback.
- Added the public IPO Pipeline view with honest missing-term states and official source/document links.
- Live adapter check returned 100 rows and 89 unique issuers; parser, alert, lint, full tests, and build were exercised during implementation.
## 2026-08-13 — Mainboard + SME board and calendar sync

- Added a shared, strict `ALL | MAINBOARD | SME` filter contract.
- Added board filtering with live counts to the public Board and Calendar views.
- Scoped lifecycle counts, search, selected detail, comparison, and calendar rendering to the selected board.
- Added board-specific ICS feeds and Google Calendar subscription URLs while preserving the existing all-IPO and single-IPO contracts.
- Added user-facing calendar sync expectations and retained source/detail links on every event.
- Ran the Production SME reclassification script without `--apply`: 37 candidates, 36 `RETRY`, 1 `EXCEPTION`, 0 `AUTO_PUBLISH`; no database writes occurred.
- Confirmed the gap is historical official-source coverage plus one real Skytech data conflict, not an SME parser or UI suppression defect.
- Preview verified All/Mainboard/SME UI state, board-specific Google/ICS links, valid empty SME feed, 400 invalid-query behavior, and no horizontal overflow at the available 1280px browser viewport.
- PR #29 CI passed validate and migration-smoke jobs; Vercel preview completed successfully.
- Added a cached fallback to NSE's official past-issues catalogue and archived issue-detail endpoint after the current catalogue misses.
- Added exact-first, unique-prefix issuer matching for shortened historical names; all material fields must still match before publication.
- Added correct `Official Prospectus` provenance for archived final documents instead of presenting them as RHPs.
- Public-name coverage improved from 1 current NSE SME issue to 9 of the 37 diagnosed names with complete NSE evidence; no Production records were changed.
- Verified the completed extension with 191 tests, zero-warning lint, a clean production build, and Prisma schema validation.
- Started a follow-up after merge because discovery intentionally skips already-tracked drafts: the scheduled ingestion cycle must revalidate a bounded slice of the existing queue for the new archive coverage to take effect automatically.
- Added a resumable `revalidation` ingestion stage that checks up to eight oldest Draft/Quarantined IPOs per scheduled run and rotates every outcome fairly.
- Kept auto-publication behind the existing Production feature flag; eligible-held, retry, conflict, incomplete-record, document provenance, and audit behavior are explicit.
- Verified the follow-up with 195 tests, zero-warning lint, a clean production build, TypeScript, and Prisma schema validation.
- Applied the two explicitly approved additive Production migrations and verified all five migrations are up to date.
- Resumed the interrupted persisted ingestion run: 8 candidates settled as 5 retries and 3 conflicts; the cycle then completed successfully.
- Verified the next clean cycle writes the filing catalogue (100 stored, 29 linked) and revalidates another bounded batch without schema errors.
- Diagnosed the apparent conflicts as two deterministic semantic defects: dates were compared as UTC instead of Indian calendar dates, and NSE's one-lot SME bid quantity was compared with the app's two-lot minimum application quantity.
- Added India-calendar comparison and SME minimum-application normalization with regression tests; full verification now passes 196 tests, lint, and production build.
