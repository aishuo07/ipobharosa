# Implementation Plan: Reliable official ingestion and transparent IPO evidence

Status: approved by the product owner on 2026-08-14; implementation in progress.

## Approach

Deliver two reviewable PRs. PR A adds the reliability and operator-control foundation. PR B adds public field-level provenance and improves financial evidence coverage/presentation. Existing auto-publication rules remain unchanged; published source drift is fail-safe and never auto-overwrites public facts.

## PR A — reliability, health, conflict/drift operations

### 1. Add additive operational models

**Files:** `prisma/schema.prisma`, new timestamped migration

Add:

```prisma
model SourceOperationHealth {
  key String @id
  source String
  operation String
  lastAttemptAt DateTime?
  lastSuccessAt DateTime?
  lastFailureAt DateTime?
  consecutiveFailures Int @default(0)
  nextRetryAt DateTime?
  lastError String?
  updatedAt DateTime @updatedAt
}
```

- Add official revalidation retry fields to `Ipo`: attempt count, next attempt, last attempt, last successful check.
- Add `OfficialEvidenceIncident` keyed by stable fingerprint with kind (`CONFLICT` or `PUBLISHED_DRIFT`), first/last seen, occurrence count, status, resolution note/actor/time, and latest capture relation.
- Add `DigestDelivery` with unique `(digestDate, recipient)` for exactly-once daily email attempts.
- All changes are additive; existing evidence/audit rows remain untouched.

### 2. Shared bounded retry and health recorder

**Files:** new `src/lib/ingestion/source-operation.ts`, official adapters/call sites, tests

- Implement maximum-attempt exponential backoff with capped delay and deterministic jitter injection for tests.
- Retry only transient failures (timeouts, network errors, 408/425/429/5xx), not validation conflicts or 4xx contract errors.
- Record source operation success/failure and next retry without leaking response bodies or secrets.
- Keep serverless work bounded; do not sleep beyond a few seconds inside a step.

### 3. Revalidation retry state and deduplicated incidents

**Files:** `src/lib/discovery/revalidate.ts`, `src/lib/discovery/official/persistence.ts`, tests

- Select only due unpublished candidates.
- Back off `RETRY` outcomes and clear retry state after a found official result.
- Continue appending raw evidence captures.
- Compute a stable fingerprint from IPO, decision kind, conflicting fields, candidate values, official values, and source.
- Upsert one incident per unchanged conflict; increment occurrences instead of creating duplicate admin work.

### 4. Published-source revalidation and drift alerts

**Files:** `src/lib/discovery/revalidate-published.ts`, `src/lib/ingestion/run-cycle.ts`, alert tests

- Add a resumable bounded `publishedRevalidation` stage (small batch per full run).
- Compare live official facts to currently published IPO facts with the existing consensus semantics.
- On match: store evidence and successful-check time.
- On unavailable source: back off without changing public data.
- On changed material field: append evidence, open/update `PUBLISHED_DRIFT`, and include it in immediate alerts/digest. Never mutate the published IPO automatically.
- Preserve checkpoint v1 compatibility by defaulting new stage summary fields.

### 5. Source-health dashboard and correction workflow

**Files:** `src/app/admin/page.tsx`, `src/app/admin/actions.ts`, `src/lib/admin-correction.ts`, CSS/tests

- Show NSE, SEBI, discovery, filing, GMP, and subscription health with last success, failures, next retry, and error summary.
- Group repeated conflicts into one incident with occurrence count and last-seen time.
- Add `Accept official values` for allowlisted material fields and require a reason/confirmation.
- Write the correction and `CorrectionLog` atomically, mark incident resolved, then schedule immediate revalidation.
- Keep retries informational and non-actionable.

### 6. Daily digest and workflow transport retry

**Files:** `src/lib/ingestion/digest.ts`, `src/lib/ingestion/run-cycle.ts`, `.github/workflows/ingest.yml`, tests

- Send one digest per IST date to configured admin recipient(s), idempotently.
- Include published, waiting, conflicts, drifts, source health, filing failures, and financial review count.
- Add curl retry/backoff for transient transport/HTTP failures; retain persisted-cursor semantics and hard failure after a bounded limit.
- Email errors are recorded and alerted but do not corrupt ingestion state.

## PR B — public provenance and financial evidence UX

### 7. Field-level clickable provenance

**Files:** `src/lib/board-data.ts`, `src/app/ipo/[slug]/page.tsx`, `src/components/IpoBoard.tsx`, CSS/tests

- Expose latest official comparison per material field: field label, displayed value, official source, source URL, and checked-at time.
- Render a compact `Data sources` table on each IPO page.
- Keep GMP explicitly unofficial and show its source links/capture times separately.
- Deduplicate document/source links.

### 8. Financial evidence coverage and display

**Files:** financial ingestion helpers, `src/lib/board-data.ts`, `src/components/IpoBoard.tsx`, admin financial queue, tests

- Queue uncaptured official RHP/DRHP documents with retry/health state.
- Keep metric publication restricted to immutable `FinancialPublished` rows with source URL and page citation.
- Improve financial table to show revenue, PAT, EPS and other available metrics without implying absent values are zero.
- Show per-year source links, page numbers, document type, and verification date.
- When no verified metrics exist, show direct official RHP/DRHP links and an honest `financial figures are being verified` state.
- Do not auto-publish PDF-extracted metrics unless a later plan defines deterministic multi-source agreement for fiscal year, unit, scope, audit status, value, and page evidence.

### 9. Production refresh and evidence report

- Run Prisma validation and migration smoke before deployment.
- Run lint, full tests, typecheck/build, responsive checks, and authenticated admin smoke.
- Deploy migration then application in the safe order.
- Trigger the real Production ingestion workflow and monitor it to completion.
- Report exact published/retry/conflict/drift/source-health counts and provide clickable public IPO/source/financial links.

## Test strategy

- Unit tests for transient classification, backoff, fingerprint stability, incident upsert, due-candidate selection, drift detection, digest idempotency, and correction validation.
- Integration tests for old checkpoint compatibility and transaction behavior.
- Component tests for source health, deduped incidents, correction form, provenance table, financial source/page links, and empty states.
- Existing 196+ tests, lint, Prisma validation, and production build must stay green.

## Rollback

- Revert application commits; additive tables/nullable columns can remain unused.
- Disable published revalidation/digest with feature flags if source load or email behavior is unexpected.
- Existing public data remains unchanged because drift detection never auto-overwrites published values.

## Todo

- [DONE] Create a fresh branch from current `main`.
- [DONE] Add and test additive operational models/migration.
- [DONE] Implement shared bounded retry and generic source health.
- [DONE] Add explicit official revalidation backoff.
- [DONE] Add conflict fingerprinting and incident deduplication.
- [DONE] Add bounded published revalidation and drift alerts.
- [DONE] Add source-health dashboard.
- [DONE] Add authenticated, audited correction action/form.
- [DONE] Add idempotent daily digest.
- [DONE] Harden GitHub Actions HTTP retries.
- [ ] Run PR A verification and deploy safely.
- [DONE] Add field-level public provenance.
- [DONE] Improve financial evidence queue and public presentation.
- [ ] Run PR B verification and deploy safely.
- [ ] Trigger and monitor a fresh Production data cycle.
- [ ] Report exact data state and clickable evidence links.

## Explicitly out of scope

- Bypassing exchange/SEBI access controls.
- Auto-overwriting already-published issue terms after a source change.
- Publishing financial figures without official document and page-level evidence.
- Treating GMP as official or guaranteed data.
