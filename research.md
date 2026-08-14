# Research: Production operations reliability and immediate official revalidation

## Scope investigated

This research covers the requested Production follow-up: an admin **Retry now** operation, conflict cooldown, source-health/retry visibility, published-value drift alerts, exact public/admin verification reasons, and how those changes relate to financials, coverage, email/domain, and beta validation.

The central finding is that most of the requested observability already exists on `main`. Rebuilding it would create duplicate contracts. The next PR should add the two missing operational controls and expose the existing evidence more clearly.

## Current architecture

```text
GitHub Actions (every 2h)
        |
        v
/api/cron/ingest -> runIngestionStep()
        |
        +-> discovery
        +-> unpublished revalidation (max 32)
        |      +-> NSE/BSE evidence bundle
        |      +-> provider-aware consensus
        |      +-> evidence/attempt persistence
        |      +-> publish | retry | conflict | wrong issue type
        +-> published revalidation (max 4)
        |      +-> match | published drift | retry
        +-> filing evidence, GMP, subscription, reminders
        +-> alert email + daily digest

/admin -> incidents + retries + source health + recent runs
public board/detail/calendar -> VERIFIED | PENDING | NEEDS_REVIEW
```

## 1. Retry scheduler and the missing targeted operation

- `src/lib/discovery/revalidate.ts:70-75` counts due `DRAFT` and `QUARANTINED` rows using `officialNextAttemptAt`.
- `src/lib/discovery/revalidate.ts:88-98` can only select the globally oldest due candidate. There is no supported function for revalidating a specific IPO by ID.
- `src/lib/discovery/revalidate.ts:110-180` already contains the correct evidence, consensus, persistence, publication and audit behavior. A targeted retry must reuse this implementation rather than duplicate it.
- `src/app/admin/actions.ts:1-146` has authenticated server actions for publish/reject and incident resolution, but no retry action.
- The Production release exposed the consequence: 12 BSE-matched drafts were on valid four-hour backoff. The only existing queue function could not safely process those exact records immediately.

Required architectural change:

```ts
async function revalidateCandidate(candidate: RevalidationCandidate): Promise<RevalidationResult>
export async function revalidateCandidateById(id: string): Promise<RevalidationResult>
export async function revalidateOldestCandidate(): Promise<RevalidationResult>
```

Both public entry points should share one implementation. `revalidateCandidateById` must reject published/rejected rows and must never modify ordering timestamps merely to influence selection.

## 2. Conflict retry loop

- `src/lib/discovery/revalidate.ts:123-139` sets an `EXCEPTION` to `QUARANTINED` but sets `officialNextAttemptAt` to `null` because only `RETRY` receives backoff.
- `src/lib/discovery/revalidate.ts:70-75` treats `null` as immediately due.
- Therefore an unchanged conflict is checked on every ingestion run. Incident tasks are deduplicated, but source requests, evidence captures and `occurrenceCount` still repeat unnecessarily.
- `src/lib/discovery/official/persistence.ts:61-110` hashes the conflict shape and upserts one incident, so the admin does not get duplicate cards. This is correct and should remain.

The smallest correction is a separate conflict recheck time, initially 24 hours:

```ts
export function nextOfficialConflictCheckAt(now = new Date()): Date {
  return new Date(now.getTime() + 24 * 60 * 60 * 1_000);
}
```

`EXCEPTION` and structurally `INVALID` records should use that time. An explicit admin retry bypasses the schedule without rewriting it first; the result sets the next schedule normally.

## 3. Source-health and retry dashboard already exists

- `src/app/admin/page.tsx:266-288` already renders GMP health, official/ingestion operation health, failure counts, next retry, last error and recent ingestion runs.
- `src/lib/discovery/official/health.ts:27-30` records each NSE/BSE attempt into `SourceOperationHealth`.
- The current operations section is collapsed and the retry cards do not include the latest provider-attempt rows, even though those rows are persisted.
- `src/lib/discovery/official/persistence.ts:14-59` stores every provider attempt and append-only evidence capture.

The PR should not create a new dashboard or schema. It should:

1. Keep the existing source-health table.
2. Add `officialAttempts` to the admin retry query.
3. Show last checked, next retry and one latest row per provider.
4. Add a visible summary for `healthy/degraded`, `retrying`, `conflicting` and `unsupported issue type`.

## 4. Exact verification reasons already exist publicly

- `src/lib/public-verification.ts:1-17` defines `VERIFIED`, `PENDING` and `NEEDS_REVIEW`.
- `src/lib/public-verification.ts:68-108` turns provider outcomes into explicit user copy for unavailable, not-found and conflict states and exposes `checkedAt`, `nextCheckAt`, coverage and providers.
- `src/lib/board-data.ts:501-523` loads the latest attempt per provider, including status, reason, issue type, source URL and checked time.
- `src/components/IpoBoard.tsx:751-769` displays the status and next-check time.
- Rejected FPO/InvIT rows are intentionally excluded from the public IPO product. Admin needs a separate excluded-issue summary so the reason is still operationally visible.

No public verification contract change is required. The admin screen should reuse the same vocabulary: **Verified**, **Retrying**, **Conflict**, **Unsupported issue type**.

## 5. Published-value drift and alerts already exist

- `src/lib/discovery/revalidate-published.ts:24-81` rechecks published IPOs without mutating public values on disagreement.
- It persists a `PUBLISHED_DRIFT` incident and reports whether the incident is new.
- `src/lib/ingestion/run-cycle.ts:219-240` sends an immediate alert email only for a new drift incident.
- `src/lib/ingestion/alert.ts:27-31` also includes drift and invalid-published counts in the run-level alert.
- `src/app/admin/page.tsx` shows published-drift incidents in a critical state with current vs official values.

The requested alert logic is therefore already shipped. Its operational dependency is `RESEND_API_KEY`; if email is not configured, the error is logged but the incident remains visible in `/admin`.

## 6. Financial data is a separate trust boundary

- `src/lib/financials/workflow.ts` ingests immutable official RHP/DRHP/Prospectus documents, normalizes extracted figures and records revisions.
- Every figure is currently routed to `REVIEW_REQUIRED`; parser confidence is not treated as semantic proof.
- Published figures retain metric, fiscal year, document URL, page number, approver and revision history.

Financial extraction should not be bundled into the retry-control PR. It needs its own plan for table selection, fiscal-year headers, units, consolidated/standalone scope, audit status, OCR fallback and source-page citations. The safe near-term automation is exception-based: deterministic, internally consistent tables can be auto-proposed, while mismatches/ambiguous scope remain review-only.

## 7. Domain and email are external configuration work

- `src/auth.ts:7-20` supports Google and Resend authentication.
- `src/lib/email/resend.ts:1-29` sends reminders and operational alerts through `RESEND_API_KEY` and `AUTH_EMAIL_FROM`.
- `src/lib/email/reminders.ts:39-126` already retries delivery, persists `SENT/FAILED`, and prevents duplicate sends.
- Code cannot purchase/verify a domain or create DNS records. Production completion requires domain ownership, Resend domain verification and Vercel DNS configuration.

This should be a separate release checklist, not mixed into database retry logic.

## 8. Real-user beta validation

The correct beta proof is a single real user completing:

```text
Google sign-in -> open Mainboard and SME IPO -> inspect source links
-> add to watchlist -> calendar sync -> receive one reminder
```

This requires the email domain/configuration to be live. Automated tests can verify contracts, but cannot replace a real OAuth + inbox delivery check.

## Risks and conclusions

1. A generic database "reset retry timestamp" button is unsafe and unnecessary. A targeted service method is cleaner and auditable.
2. Server actions must remain admin-authenticated and must use the ingestion lock to avoid racing the scheduled cycle.
3. Conflict cooldown should reduce repeated work without hiding the incident; the admin card remains open until resolved.
4. The source-health dashboard, drift detection and public reason model should be reused, not reimplemented.
5. The immediate Production outcome is achievable after the small PR: deploy, then invoke the supported targeted revalidation service for the 12 already-confirmed BSE matches.
