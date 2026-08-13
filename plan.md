# Exception-only IPO publishing pipeline

Status: approved by the product owner on 2026-08-12.

## Goal

Replace the current page-existence confidence shortcut with field-level evidence from authoritative sources. Publish automatically only when official core facts are complete and consistent; retry temporary gaps and send genuine conflicts to an exception queue.

The production dry-run exposed a second architectural requirement: market coverage and application readiness are different concepts. The public product must show every legitimate IPO lifecycle record it can prove from an official filing, even when price, lot size, or dates are not announced yet. Missing terms must be shown as awaited, never converted to zero or hidden behind the application-ready publication gate.

## Work

- [DONE] Define normalized evidence and decision contracts.
- [DONE] Add an NSE official-source adapter behind a source-neutral interface.
- [DONE] Add deterministic `AUTO_PUBLISH`, `RETRY`, and `EXCEPTION` consensus decisions.
- [DONE] Persist immutable source captures and field comparisons.
- [DONE] Integrate the decision into new discovery and existing-draft revalidation.
- [DONE] Turn the admin page into an exception workspace.
- [DONE] Show clickable field provenance publicly.
- [DONE] Add an official SEBI filing catalogue adapter for recent DRHP and RHP filings.
- [DONE] Persist the catalogue independently from the application-ready `Ipo` model and link entries when a verified IPO exists.
- [DONE] Add a public IPO Pipeline view with source links, filing stage, and explicit "terms awaited" state.
- [DONE] Add a cached read-through fallback so the catalogue remains visible during code-before-migration deploys.
- [DONE] Integrate catalogue refresh into the existing two-hour ingestion cycle without making GMP/subscription ingestion depend on SEBI availability.
- [ ] Run final checks, preview validation, PR, and production deployment.

## Production dry-run evidence (2026-08-12)

- 38 unpublished candidates were read; no database writes were performed.
- `AUTO_PUBLISH`: 0.
- `RETRY`: 35. Most are older or BSE-only candidates no longer present in the current NSE catalogue; one exposed an NSE full-month date variant and the parser was updated.
- `EXCEPTION`: 3 (`Skytech Infinite Platform`, `Behari Lal Engineering`, `Lalithaa Jewellery Mart`) due to actual date/lot mismatches.
- Conclusion: bulk `--apply` remains blocked. The feature flag stays off while SEBI/historical coverage is added for candidates outside NSE's live catalogue.

## Filing-catalogue verification (2026-08-13)

- The adapter read two pages each of SEBI's public DRHP and RHP catalogues through the same listing and pagination endpoints used by the official site.
- Live result: 100 official rows, 89 unique issuers, covering filings from 2026-01-13 through 2026-08-12.
- The public view deduplicates issuer revisions, prefers RHP over DRHP, excludes already-published matched IPOs, and links every card back to SEBI.

## Safety constraints

- BSE `403` responses are not bypassed.
- Sector is optional enrichment and never blocks publication.
- Bank and registrar pages are not treated as primary sources for unrelated fields.
- Financial-statement extraction is outside this change.
- Bulk publication is never performed by the dry-run; `--apply` is a separate explicit operation.
- Automatic publication is protected by `OFFICIAL_IPO_AUTO_PUBLISH_ENABLED` and remains disabled until the production dry-run is reviewed.
- A filing catalogue entry is not an application recommendation and does not fabricate application terms.
- SEBI filing pages are read through their public HTML contract; authentication, access controls, and BSE `403` responses are never bypassed.
