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
