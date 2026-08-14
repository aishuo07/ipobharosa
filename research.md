# Research: IPO ingestion reliability, provenance, drift detection, and financial evidence

## 2026-08-14 extension: public visibility for unverified IPOs

### Product problem confirmed in Production

- Production currently contains 30 `PUBLISHED`, 31 `DRAFT`, and 3 `QUARANTINED` IPO records. The public board only queries `publicationState: "PUBLISHED"` in `src/lib/board-data.ts:242-247`, so more than half of the complete discovered IPO records are intentionally invisible.
- The hidden records are not all bad records: drafts include complete IPO terms awaiting an official check or retry; quarantined records contain a detected source mismatch. The user wants visibility without falsely presenting those records as verified.
- A separate SEBI filing radar already shows filing-only issuers in `src/components/IpoBoard.tsx:406-454`. Those records do not necessarily contain final price, lot, or dates and should remain separate from IPO-term cards.

### Current public data flow and affected consumers

```text
Ipo rows
  -> getBoardIpos() [PUBLISHED only]
     -> Home board, search, compare, selected detail
     -> /ipo/[slug] detail lookup + metadata
     -> sitemap.xml
     -> calendar ICS / Google Calendar subscription
```

- `src/lib/board-data.ts:8-58` has no publication/verification state in `BoardIpo`; the UI cannot distinguish verified, pending, or conflicting records.
- `src/lib/board-data.ts:91-231` shapes nullable database values into zero-like values. Unverified records must only enter the board contract when all required core facts are present; otherwise the existing filing radar is the honest representation.
- `src/components/IpoBoard.tsx:519-618` renders lifecycle and board badges but no trust badge. `DetailPanel` and `/ipo/[slug]` similarly present all facts without an overall verification warning.
- `src/components/IpoBoard.tsx:1238+` compare rows do not include verification state, so mixed-trust comparisons would be misleading without an explicit row.
- `src/app/ipo/[slug]/page.tsx:29-51` generates indexable metadata. Pending/conflicting detail pages should be accessible but `noindex` until verified.
- `src/app/sitemap.ts:9-21` and `src/app/api/calendar/route.ts:7-22` consume `getBoardIpos`. Search indexing and calendar syndication need separate policies: pending/conflicting pages remain `noindex`, while calendars may include every complete IPO only if each event permanently carries the verification state and warning in its title and description.
- Watchlisting can safely remain available: it is a user preference, not a verification claim, and reminders already follow stored lifecycle transitions.

### Trust-state model

The database state already provides the correct source of truth; no migration is required:

| Database state | Public trust state | User-facing language | Public behavior |
|---|---|---|---|
| `PUBLISHED` | `VERIFIED` | Automated verification passed | Normal card, indexable, calendar event labelled verified |
| `DRAFT` | `PENDING` | Automated verification pending | Visible with warning; collected values may change; noindex; calendar event labelled pending |
| `QUARANTINED` | `NEEDS_REVIEW` | Source mismatch under review | Visible with critical warning; noindex; calendar event labelled needs review |
| `REJECTED` | none | none | Never public |

Latest official capture timestamps and matched field provenance already exist and can support the trust explanation. Internal raw errors should not be exposed; only a short safe conflict summary belongs in the public contract.

### Architectural conclusion

Use two explicit read contracts instead of weakening verification:

```text
getPublicIpos()   -> complete PUBLISHED + DRAFT + QUARANTINED records
getIndexableIpos() -> PUBLISHED records only
```

The board/detail/search/calendar use the public contract and make trust state unavoidable. Calendar event summaries and descriptions carry the trust state because external calendar clients cannot rely on the website UI. Sitemap uses the indexable verified-only contract. This preserves coverage and honesty simultaneously.

## Scope researched

The requested change spans the scheduled ingestion runner, official NSE/SEBI adapters, append-only evidence storage, admin operations, public IPO detail pages, and the financial publication pipeline. This report documents the current flow and the smallest production-safe extension.

## Current end-to-end flow

```text
GitHub Actions every two hours
  -> GET /api/cron/ingest (CRON_SECRET)
  -> resumable IngestionRun checkpoint
  -> status/reminders + SEBI filing catalogue + discovery
  -> 8 unpublished-candidate official revalidations
  -> official filing PDF capture
  -> GMP collection and source health
  -> subscription collection
  -> alerts only when the run finishes
```

- `.github/workflows/ingest.yml:15-35` loops through at most 50 bounded HTTP steps. Any transient curl/TLS failure exits immediately; it does not retry the HTTP call with backoff.
- `src/app/api/cron/ingest/route.ts:6-24` protects the route with `CRON_SECRET` and converts uncaught step errors into HTTP 500.
- `src/lib/ingestion/run-cycle.ts:74-139` persists a resumable stage/cursor checkpoint after each bounded step. This is a strong base: retries resume instead of repeating completed IPO writes.
- `src/lib/ingestion/run-cycle.ts:141-168` computes a fixed batch of eight unpublished candidates per run.
- `src/lib/discovery/discover.ts:261-273` already gives discovery-detail failures exponential backoff through `DiscoveryAttempt.nextAttemptAt`. That mechanism does not cover official revalidation, filing downloads, SEBI catalogue refresh, GMP, or subscription fetches.

## Official verification and conflict behavior

- `src/lib/discovery/revalidate.ts:67-81` selects the least-recently-updated `DRAFT` or `QUARANTINED` IPO. Every attempt touches `updatedAt`, producing fair rotation but no explicit retry schedule, failure count, or next eligible time.
- `src/lib/discovery/revalidate.ts:94-125` compares stored candidate facts with live official evidence and persists the decision.
- `src/lib/discovery/official/persistence.ts:8-33` inserts a complete `OfficialEvidenceCapture` plus field comparisons on every found-source check. Repeated identical conflicts therefore generate repeated rows. The append-only captures are valuable audit evidence and should remain; the operator queue needs a separate deduplicated incident projection.
- `prisma/schema.prisma:154-190` contains append-only official captures/comparisons but no fingerprint, occurrence counter, acknowledgement state, or resolution record.
- Published IPOs are never put back through official comparison. Source changes after publication are currently invisible unless a human notices them.

## Source health and alerts

- `prisma/schema.prisma:272-286` has `SourceHealth`, but it is one-to-one with `GmpSource`; it cannot represent NSE catalogue, NSE issue detail, SEBI filings, IPO Watch discovery, subscription, or document capture.
- `src/lib/ingestion/run-cycle.ts:244-285` updates GMP health per observation.
- `src/app/admin/page.tsx:41-57,199-220` shows GMP health and recent runs. There is no official-source dashboard, next-retry time, stale-source calculation, or unresolved drift count.
- `src/lib/ingestion/alert.ts:8-38` reports run crashes, DB failures, queue caps, filing failures, catalogue failures, total GMP outage, and reminder failures. It does not alert on repeated official conflicts or changes to published facts.
- `src/lib/ingestion/run-cycle.ts:323-334` sends alert email only after a completed run; failed/stuck workflows may never reach that call.
- There is no idempotent daily digest model. Sending a digest directly from a two-hour cron would risk duplicates.

## Admin correction behavior

- `src/app/admin/page.tsx:104-193` distinguishes retries from genuine conflicts and shows collected vs official values with source links.
- `src/app/admin/actions.ts:17-67` supports whole-record approve/reject only. It cannot accept an official correction for selected fields, explain the correction, resolve a conflict incident, or handle published-value drift.
- `CorrectionLog` (`prisma/schema.prisma:404-418`) already provides the right immutable audit log for operator corrections.

## Public provenance

- `src/lib/board-data.ts:48-124` shapes official, GMP, subscription, document, and financial provenance.
- `src/lib/board-data.ts:188-211` loads only the latest official capture and reduces all matched facts to a single prose note. The public contract does not expose field-by-field source, check time, or official value.
- `src/app/ipo/[slug]/page.tsx:89-113` already has a source section with clickable links.
- `src/components/IpoBoard.tsx:1121-1157` displays immutable published financials and direct filing links with page citations. `DocumentsPanel` (`1162-1204`) exposes official filing and registrar links.
- The public UI can be improved without inventing data by adding a field-level provenance table and a better financial empty state that links the official RHP/DRHP.

## Financial pipeline reality

- `FinancialDocument`, `FinancialExtraction`, `FinancialRevision`, and `FinancialPublished` (`prisma/schema.prisma:313-397`) support checksummed documents, raw/normalized extraction, review states, immutable published values, page numbers, and source URLs.
- `src/lib/financials/filing-evidence.ts:13-52` safely downloads only approved filing hosts, validates PDF bytes, and hashes the document.
- `src/lib/financials/workflow.ts:58-124` normalizes parser output but intentionally routes every metric to `REVIEW_REQUIRED`. Parser confidence is not semantic proof.
- `src/app/admin/financials/page.tsx` provides review, while `src/components/IpoBoard.tsx:1121-1157` publishes only `FinancialPublished` rows.
- Official NSE/SEBI issue catalogues provide issue terms and documents, not a stable structured financial-statements API. Reliable revenue/PAT/EPS extraction requires document section identification, unit/scope/fiscal-year interpretation, and page citation. Auto-publishing parser guesses would weaken the product's core trust claim.

## Recommended architecture

```text
Source call
  -> bounded retry with exponential backoff + jitter
  -> SourceOperationHealth upsert
  -> official comparison
       MATCH on unpublished -> existing auto-publish
       RETRY -> explicit nextAttemptAt
       CONFLICT -> append capture + upsert one deduplicated incident
       MATCH on published -> mark revalidated
       CHANGE on published -> open drift incident + immediate alert

Daily digest (idempotent date key)
  -> source health
  -> published / retry / conflict counts
  -> unresolved drifts
  -> financial review queue

Public IPO detail
  -> value | official source | checked at | clickable evidence
  -> financial metric | fiscal year | official filing | page | verified at
  -> when metrics unavailable: direct official filing links, never placeholders
```

## Design decisions

1. Keep `OfficialEvidenceCapture` append-only; add a deduplicated incident table keyed by stable fingerprint.
2. Add generic source-operation health rather than overloading GMP-specific health.
3. Store retry state per IPO for official revalidation; do not infer it from `updatedAt`.
4. Revalidate a small bounded slice of published IPOs, prioritized by oldest successful official check.
5. A published mismatch never silently overwrites public data. It opens a drift incident and alerts an admin.
6. Admin correction applies only allowlisted fields, records old/new values and reason, resolves the incident, then immediately revalidates.
7. Daily digest is idempotent by calendar date and recipient.
8. Financial metrics remain filing-backed and page-cited. This change improves capture queue and presentation; it does not turn PDF extraction confidence into automatic truth.

## Risks

- Adding stages changes persisted checkpoint shape. `readCheckpoint` must default new summary fields and accept existing Production checkpoints.
- Database migrations must be additive and deployed before code paths write new tables/columns.
- Revalidating published IPOs increases official-source traffic; batches and cache reuse must stay bounded.
- Email delivery must not block ingestion completion.
- A correction form is security-sensitive: admin authentication, allowlisted fields, validation, transactionality, and audit records are mandatory.
