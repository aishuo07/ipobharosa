# Exception-only IPO publishing pipeline

Status: approved by the product owner on 2026-08-12.

## Goal

Replace the current page-existence confidence shortcut with field-level evidence from authoritative sources. Publish automatically only when official core facts are complete and consistent; retry temporary gaps and send genuine conflicts to an exception queue.

## Work

- [DONE] Define normalized evidence and decision contracts.
- [DONE] Add an NSE official-source adapter behind a source-neutral interface.
- [DONE] Add deterministic `AUTO_PUBLISH`, `RETRY`, and `EXCEPTION` consensus decisions.
- [DONE] Persist immutable source captures and field comparisons.
- [DONE] Integrate the decision into new discovery and existing-draft revalidation.
- [DONE] Turn the admin page into an exception workspace.
- [DONE] Show clickable field provenance publicly.
- [ ] Run final checks, preview validation, PR, and production deployment.

## Production dry-run evidence (2026-08-12)

- 38 unpublished candidates were read; no database writes were performed.
- `AUTO_PUBLISH`: 0.
- `RETRY`: 35. Most are older or BSE-only candidates no longer present in the current NSE catalogue; one exposed an NSE full-month date variant and the parser was updated.
- `EXCEPTION`: 3 (`Skytech Infinite Platform`, `Behari Lal Engineering`, `Lalithaa Jewellery Mart`) due to actual date/lot mismatches.
- Conclusion: bulk `--apply` remains blocked. The feature flag stays off while SEBI/historical coverage is added for candidates outside NSE's live catalogue.

## Safety constraints

- BSE `403` responses are not bypassed.
- Sector is optional enrichment and never blocks publication.
- Bank and registrar pages are not treated as primary sources for unrelated fields.
- Financial-statement extraction is outside this change.
- Bulk publication is never performed by the dry-run; `--apply` is a separate explicit operation.
- Automatic publication is protected by `OFFICIAL_IPO_AUTO_PUBLISH_ENABLED` and remains disabled until the production dry-run is reviewed.
