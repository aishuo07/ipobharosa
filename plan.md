# Implementation Plan: launch readiness and date-wise IPO experience

Status: approved by the product owner on 15 August 2026; PR 1–3 are live, and the official ZIP filing path is under review in PR 4.

## Outcome

Before a wider public launch, IPOBharosa will have:

- a clear date-wise **All IPOs** view with major issue details;
- a calendar that exposes detailed events without overcrowding its month grid;
- a two-hour ingestion cycle that is not blocked by slow filing PDFs;
- honest, visible boundaries between complete IPOs, early filings and verification exceptions;
- environment-driven canonical links and a testable email/domain readiness path;
- Preview evidence and one real-user beta checklist before Production launch.

No IPO or financial value will be invented to make the catalogue look fuller.

## Release strategy

Use small pull requests against `main`. Each PR gets CI, isolated Vercel Preview, responsive/browser verification and explicit review before merge.

```text
PR 1  Date-wise All IPOs + calendar agenda
PR 2  Ingestion critical-path repair
PR 3  Domain/email/canonical readiness
PR 4  Safe official ZIP filing acquisition and extraction
Task  Real-user beta proof + launch checklist
Track Financial document/extraction coverage
```

## PR 1 — Date-wise All IPOs catalogue and calendar agenda

### 1. Extract reusable chronology helpers

**New file:** `src/lib/ipo-chronology.ts`

Add pure functions for:

- deterministic local-day keys;
- lifecycle events for open, close, allotment and listing;
- next meaningful lifecycle event;
- chronological sorting and month/date grouping;
- status/verification/board filter composition.

Do not duplicate date logic inside React components.

### 2. Add the All IPOs view

**File:** `src/components/IpoBoard.tsx`

Extend the top-level view contract to:

```ts
type PublicView = "board" | "catalogue" | "pipeline" | "calendar";
```

The new **All IPOs** view will:

- show complete public IPO records only;
- default to upcoming/current lifecycle dates first;
- allow newest/oldest opening-date sorting;
- reuse Mainboard/SME, lifecycle, verification and search filters;
- show exact filtered result counts;
- render a dense table-like layout on desktop and stacked summary cards on mobile;
- link every row to the existing full detail page;
- support watchlist and single-IPO calendar actions.

Major fields:

```text
Company + sector        Board + status + verification
Open -> close           Allotment + listing
Price band              Lot + minimum investment
Issue size              GMP + freshness/agreement
Subscription summary    Evidence/detail/calendar actions
```

Add a short boundary note: “All IPOs contains issues with complete public terms; early DRHP/RHP filings remain in IPO Pipeline.”

### 3. Upgrade Calendar without overloading cells

**Files:** `src/components/IpoBoard.tsx`, `src/app/globals.css`

- Add allotment to the visual legend and grid events.
- Make dates selectable with button semantics and visible focus state.
- Add a detailed agenda below the grid for the selected day; when no date is selected, show the month’s next events.
- Agenda cards reuse the catalogue’s major-detail summary.
- Preserve Google live subscription and ICS download.
- Keep Mainboard/SME filter behaviour consistent across grid, agenda and calendar links.
- On small screens, keep the grid scannable and put all details in the agenda, never inside tiny cells.

### 4. Clarify public counts

**File:** `src/components/IpoBoard.tsx`

Explain the three inventory levels in plain language:

- tracked issuers;
- official filings;
- complete IPO pages.

Do not present 105 tracked issuers as 105 ready-to-apply IPOs.

### 5. Styling and accessibility

**File:** `src/app/globals.css`

- Use the existing IPOBharosa design tokens and primitives.
- Preserve the clean white/orange professional visual system.
- Add restrained 120–180 ms hover/focus transitions and respect `prefers-reduced-motion`.
- Use semantic headings, tables/lists, buttons and `aria-current`/`aria-selected` where appropriate.
- Ensure touch targets are at least 44 px for primary mobile actions.
- No horizontal overflow at 360, 390, 768, 1024 or 1440 CSS pixels.

### 6. Tests and Preview acceptance

**New/updated files:** `src/lib/ipo-chronology.test.ts`, component/static-render tests where practical, calendar tests and smoke script.

Required cases:

1. local-date grouping is timezone-safe;
2. open/close/allotment/listing events are ordered deterministically;
3. Mainboard/SME, status and verification filters compose correctly;
4. missing GMP/subscription produces explicit pending text, not zero or fabricated data;
5. verified/pending/needs-review rows retain their labels and source links;
6. calendar agenda and ICS use the same event contract;
7. keyboard and mobile layouts work;
8. existing Board, Compare, Pipeline and Detail remain unchanged.

Run:

```bash
npm run lint
npm test
npx tsc --noEmit
npm run build
npx prisma validate
```

Preview verification:

- 360, 390, 768, 1024 and 1440 px;
- All/Mainboard/SME;
- verified/pending/needs-review;
- search and empty results;
- calendar month navigation, date selection, Google subscription and ICS;
- at least one full detail/source-link journey.

## PR 2 — Ingestion critical-path repair

### 1. Remove filing downloads from the two-hour cycle

**Files:** `src/lib/ingestion/run-cycle.ts`, `.github/workflows/ingest.yml`

The two-hour cycle will finish after:

```text
prepare -> candidate verification -> published drift -> GMP -> subscription -> finalize
```

The independent worker discovers missing filing documents from persisted official URLs; the two-hour cycle never downloads their PDFs.

### 2. Use the daily filing workflow as a bounded queue worker

**Files:** `.github/workflows/financial-extraction.yml`, `pdf-extractor/worker.py`, financial document queue/service files.

- Process a bounded number of documents per run.
- Persist attempt count, last error and next retry.
- Exponential backoff for timeouts/5xx.
- Long cooldown for deterministic 403/406 until the source URL changes or an admin retries.
- Never block GMP/subscription refresh.
- Report `documents queued/downloaded/failed`, `candidates proposed` and `figures published`; a green job with zero candidates remains visible as zero output.

### 3. Acceptance

- Three consecutive scheduled two-hour cycles complete successfully.
- One bad/slow filing host cannot fail the market-data cycle.
- A failed document stays retryable and visible in admin.
- GMP/subscription timestamps advance even when documents fail.
- No duplicate documents, observations or published financials.

## PR 3 — Domain, email and canonical readiness

### Code work

- Introduce one validated `SITE_URL`/`NEXT_PUBLIC_SITE_URL` contract.
- Replace hard-coded Vercel URLs in calendar, reminders, alerts, robots and sitemap.
- Add an email feature flag/readiness check that requires Resend key, verified sender configuration and site URL before exposing email sign-in/reminder claims.
- Keep Google sign-in available.
- Add a safe admin health summary showing configuration presence, never secret values.
- Add Terms, Privacy, Disclaimer and Corrections/Support links/pages before broad launch.

### Owner actions

- Buy/select the custom domain.
- Connect the domain in Vercel.
- add and verify Resend DNS records;
- provide the final sender address;
- approve legal/disclaimer copy.

### Acceptance

- custom domain serves the reviewed Production commit;
- canonical/sitemap/robots/calendar/email links use the custom domain;
- Google login succeeds;
- one real email reaches a consented inbox;
- one watchlist reminder reaches the same user and duplicate delivery is prevented;
- unsubscribe/remove-watchlist path works;
- Vercel alias remains a redirect or safe fallback.

## Financial-data track

Financials remain visible only when backed by immutable approved records. The current workflow’s zero-candidate result is not launch-complete.

Next measurable steps:

1. improve official document acquisition and checksums;
2. identify the exact financial statement pages/table headers;
3. extract value, unit, fiscal year, scope and audit/restatement status;
4. route ambiguous/OCR cases to review;
5. publish only accepted immutable revisions with source URL and page number;
6. expose coverage metrics: documents available, extraction attempted, candidates, approved figures and unsupported cases.

Financial coverage can continue after private beta, but unverified figures must stay explicitly unavailable.

### PR 4 — official exchange ZIP filings

- Accept direct official PDFs and official exchange ZIP downloads.
- Bound compressed download size, expanded PDF size, archive entry count and total expanded PDF bytes.
- Select RHP versus DRHP deterministically and fail closed on ambiguous archives.
- Hash the extracted PDF bytes so capture and Python extraction produce the same immutable evidence checksum.
- Return source format, selected archive entry and a bounded failure reason from the worker.
- Exercise the same rules in TypeScript and Python tests before Production execution.

## Final launch checklist

### Required before public beta

- [x] PR 1 merged and Production-smoked.
- [x] PR 2 merged; one Production cycle is green without filing work on the critical path.
- [ ] Two additional ingestion cycles complete the three-cycle acceptance window.
- [ ] Admin queue has no unexplained critical drift/conflict.
- [ ] Terms, Privacy, Disclaimer and correction contact are public.
- [ ] Google auth and one real watchlist/calendar journey pass.
- [ ] Backup/restore procedure is rehearsed.

### Required before marketing/wider launch

- [ ] Custom domain active.
- [ ] Resend domain verified and real reminder E2E passed.
- [ ] Error/availability monitoring and alert ownership confirmed.
- [ ] One external beta user completes the full journey without help.
- [ ] Public inventory counts and verification-state explanations are understandable.
- [ ] Financial coverage is reported honestly; no guessed values are exposed.

## Rollback

- PR 1 has no migration; revert it if navigation or rendering regresses.
- PR 2 preserves the document queue and removes slow work from the hot path; revert the workflow change without deleting evidence rows.
- PR 3 keeps the Vercel URL as fallback; domain cutover can be reversed through DNS/alias configuration.
- All database changes must be additive, backed up and Preview-tested. No destructive migration belongs in these releases.

## Todo

- [x] Audit live UI and data boundaries.
- [x] Audit recent ingestion and financial workflow evidence.
- [x] Audit configured environment names and domain presence.
- [x] Write this implementation plan.
- [x] Obtain explicit approval for this plan.
- [x] Implement PR 1 on a fresh branch from current `main`.
- [x] Validate PR 1 in Preview and merge after review.
- [x] Remove PDF downloads from the two-hour ingestion checkpoint path.
- [x] Add the separately locked, bounded filing-evidence worker with persisted per-document backoff.
- [x] Pass PR 2 local tests, typecheck, lint, build and Prisma validation.
- [x] Validate PR 2 in Preview and merge.
- [x] Run one Production ingestion cycle successfully (run 31836766490: complete in 1m55s; 47 GMP and 14 subscription snapshots written while legacy PDF failures were bypassed).
- [ ] Observe two more scheduled ingestion cycles to complete the three-cycle acceptance window.
- [x] Implement the validated site-origin contract, canonical metadata, configurable workflow URLs and honest user-email readiness gate.
- [x] Add non-secret site/email readiness to the admin dashboard and pass PR 3 local gates (40 files, 255 tests).
- [x] Validate PR 3 in Preview, merge and smoke Production (root, login, sitemap, robots and calendar all 200).
- [x] Keep user email hidden until a custom domain and Resend sender are verified; Google remains available.
- [x] Add bounded ZIP extraction to both the capture worker and Python financial extractor with matching selection rules.
- [x] Validate and merge PR 4; Production capture run 31875606474 captured 1 document and safely deferred 29 source-access failures.
- [x] Run financial extraction 31876030478: 10 official filings scanned, 0 submitted, 10 safely skipped; confirmed summary-layout detection is the blocker.
- [x] Extend the strict parser for the observed official consolidated/standalone summary-table layout; validate six Revenue/PAT rows against the real Indo-MIM RHP before rerunning extraction.
- [ ] Merge PR 5 and rerun the Production financial extraction workflow.
- [ ] Complete owner DNS/domain actions and enable email only after verification.
- [ ] Run the real-user beta checklist and record evidence.

## Approval checkpoint

Implementation starts only after the product owner explicitly approves this written plan. Approval covers PR 1 and PR 2 code work. Domain purchase, DNS changes, public email enablement and legal publication remain separate explicit owner actions because they affect external systems and public commitments.
