# Implementation log

## 2026-08-13 — coverage architecture

- Split official filing coverage from application-ready IPO records with `IpoFilingCatalogue`.
- Added the SEBI DRHP/RHP adapter and supported public pagination contract.
- Added ingestion persistence, issuer linking, non-fatal source health reporting, and a migration-safe cached read-through fallback.
- Added the public IPO Pipeline view with honest missing-term states and official source/document links.
- Live adapter check returned 100 rows and 89 unique issuers; parser, alert, lint, full tests, and build were exercised during implementation.
