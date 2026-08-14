# Implementation Plan: Production retry control and verification operations

Status: approved by product owner on 2026-08-15; implementation complete and release validation in progress.

## Approach

Ship one small, reversible operational PR that adds a safe targeted revalidation service, an authenticated admin **Retry now** action, a 24-hour conflict cooldown, and clearer reuse of the evidence already stored in Production.

Do not rebuild features already on `main`: source-health tables, published drift detection/email, public verification labels and official source links already work. Financial extraction, domain/email configuration and beta validation remain separate follow-ups because they have different trust and external-dependency boundaries.

## Changes required

### 1. Extract one shared candidate revalidation implementation

**File:** `src/lib/discovery/revalidate.ts`

Refactor the existing body so queue and targeted retries use identical logic:

```ts
async function revalidateCandidate(candidate: RevalidationCandidate): Promise<RevalidationResult> {
  // existing fetch -> health -> consensus -> transaction -> audit flow
}

export async function revalidateCandidateById(id: string): Promise<RevalidationResult> {
  const candidate = await prisma.ipo.findFirst({
    where: { id, publicationState: { in: ["DRAFT", "QUARANTINED"] } },
    select: candidateSelect,
  });
  return candidate ? revalidateCandidate(candidate) : { company: null, outcome: "EMPTY", reasons: [] };
}
```

`revalidateOldestCandidate` keeps the current due/oldest selector and delegates to the same implementation. No schema change and no artificial `updatedAt` manipulation.

### 2. Add conflict and invalid-record cooldown

**File:** `src/lib/discovery/revalidate.ts`

Add a deterministic 24-hour cooldown:

```ts
export function nextOfficialConflictCheckAt(now = new Date()): Date {
  return new Date(now.getTime() + 24 * 60 * 60 * 1_000);
}
```

- `RETRY`: keep exponential 2h/4h/8h/16h/24h backoff.
- `EXCEPTION`: retain `QUARANTINED`, keep the open incident, schedule a 24-hour recheck.
- `INVALID`: retain `QUARANTINED`, schedule a 24-hour recheck.
- Manual **Retry now** bypasses the wait by targeting the record directly; its result writes the normal next schedule.

### 3. Add an authenticated, locked admin retry action

**Files:** `src/app/admin/actions.ts`, new `src/lib/discovery/retry-operation.ts`

Keep orchestration outside the page action so it is unit-testable:

```ts
export async function retryOfficialVerificationNow(ipoId: string, actor: string) {
  const acquired = await acquireIngestionLock(`admin-retry:${actor}`);
  if (!acquired) return { status: "BUSY" as const };
  try {
    const result = await revalidateCandidateById(ipoId);
    await recordRetryAudit(ipoId, actor, result);
    return { status: "COMPLETED" as const, result };
  } finally {
    await releaseIngestionLock();
  }
}
```

The server action:

- calls existing `requireAdmin()`;
- validates a non-empty IPO ID;
- calls the locked service;
- revalidates `/admin`, `/`, `/ipo/[slug]` and `/api/calendar` data paths as applicable;
- never accepts source values or publication decisions from the browser.

### 4. Improve admin retry/source visibility without a new dashboard

**File:** `src/app/admin/page.tsx`

- Include recent `officialAttempts` for retry/conflict cards.
- Display `last checked`, `next retry`, provider status/reason and official link.
- Add **Retry official sources now** to draft/quarantined cards.
- Keep conflict resolution actions separate from retry; retry never accepts data.
- Add a compact excluded issue-types section for `REJECTED` rows whose `officialIssueType` is not `IPO`.
- Keep the existing source-health and recent-run tables; surface a compact count summary above them instead of creating another page.

### 5. Tests

**Files:** `src/lib/discovery/revalidate.test.ts`, new `src/lib/discovery/retry-operation.test.ts`, targeted admin/view-model tests where practical.

Test cases:

1. Queue retry and ID retry delegate to identical publication behavior.
2. ID retry cannot target `PUBLISHED` or `REJECTED` rows.
3. `EXCEPTION` schedules 24 hours and keeps the incident open.
4. `INVALID` schedules 24 hours.
5. `RETRY` retains exponential backoff.
6. Admin retry acquires/releases the ingestion lock in success and error cases.
7. Busy lock causes no evidence/publication mutation.
8. Audit log records actor, IPO and outcome.
9. Admin view shows provider attempt reasons and unsupported issue types.

Run:

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
npx prisma validate
```

### 6. Preview and Production release

1. Push the `codex/production-ops-reliability` branch and create a PR.
2. Deploy preview; verify unauthenticated `/admin` redirects to login and public pages still render.
3. Verify the admin retry button with a non-publishing retry fixture or preview database.
4. Merge only with green CI.
5. Deploy Production; no migration is required.
6. Use the new targeted service under the ingestion lock to revalidate the 12 BSE-matched Production drafts immediately.
7. Confirm exact results, evidence captures, correction logs, published count delta, source links, board/detail/calendar visibility and zero unresolved unexpected conflicts.

## Follow-up PR sequence

### PR 2: Financial evidence automation

- Official RHP/Prospectus fetch + checksum/versioning.
- Deterministic table/page/fiscal-year/unit/scope/audit-status extraction.
- Cross-statement consistency checks.
- Auto-propose high-confidence figures; auto-publish only after a separately approved policy with regression fixtures.
- Exception queue for OCR, ambiguous headers, scope conflicts and material revisions.

### PR 3: Remaining coverage

- Retry/not-found classification metrics by exchange and issue type.
- SEBI filing-to-exchange linking improvements.
- Alias additions only from reviewed fixtures.
- Coverage acceptance report for Mainboard and SME.

### Release task: Domain and email

- Purchase/connect the final domain.
- Verify it in Resend and add DNS records.
- Configure `RESEND_API_KEY`, `AUTH_EMAIL_FROM`, alert recipients and canonical site URL.
- Redeploy and send test auth, reminder and drift-alert emails.

### Beta task: one real user

- Google sign-in.
- Mainboard/SME discovery and official-source link inspection.
- Watchlist add/remove.
- Google Calendar subscription/add-to-calendar.
- Real reminder delivery and unsubscribe verification.

## Rollback

- Revert the PR; it has no schema migration.
- Existing queue backoff and ingestion behavior remains intact.
- Conflict incidents/evidence are append-only and are not deleted.
- Disable the admin button at the UI level if an operational issue is found; scheduled ingestion continues independently.

## Todo

- [x] [DONE] Refactor shared candidate revalidation.
- [x] [DONE] Add targeted ID retry.
- [x] [DONE] Add 24-hour conflict/invalid cooldown.
- [x] [DONE] Add locked retry operation and audit log.
- [x] [DONE] Add authenticated admin server action.
- [x] [DONE] Add retry button and provider-attempt details.
- [x] [DONE] Add unsupported issue-type admin summary.
- [x] [DONE] Add/extend unit tests.
- [x] [DONE] Run full local quality gates.
- [x] [DONE] Deploy and smoke-test preview.
- [ ] Push and create PR.
- [ ] Merge and deploy Production after review.
- [ ] Immediately revalidate the 12 matched Production IPOs.
- [ ] Verify public evidence and exact Production counts.

## Open questions

None. Safety defaults are fixed: admin authentication required, ingestion lock required, no timestamp-ordering hacks, no browser-supplied official values, no auto-resolution of conflicts, and no financial publication-policy change in this PR.
