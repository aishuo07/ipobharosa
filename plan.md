# Plan: Production public launch and installable PWA

Date: 17 August 2026
Status: approved by owner; implementation in progress.

## Outcome

Take the current Production product to a defensible public beta and add an installable app experience without creating a second native codebase. Work will be delivered as small PRs from fresh `origin/main`, each verified on Vercel Preview before merge.

```text
PR A  Canonical identity + browser hardening + social previews
PR B  Installable PWA + offline boundary
PR C  External monitoring + recovery/operator runbook
Gate  Real-user auth/watchlist/reminder proof
Beta  20-50 invited users for 7 days
Launch Public beta if thresholds pass
```

No schema migration is expected for PR A or PR B. Production configuration changes remain explicit deployment steps and will not be guessed from code.

## PR A — one public identity and a hardened web surface

### Code changes

- Expand root metadata with metadata base, canonical policy, Open Graph and Twitter fields.
- Add a branded social share image using the existing design system.
- Add tested security headers in `next.config.ts`: Content-Security-Policy, frame protection, `X-Content-Type-Options`, `Referrer-Policy` and an appropriate permissions policy.
- Add a checked-in `.env.example` containing names and safe descriptions only—never credentials.
- Add a deployment check that fails when public canonical, sitemap and configured Production origin disagree.

### Deployment steps

- Select/connect the final domain.
- Set matching Vercel `SITE_URL` and `NEXT_PUBLIC_SITE_URL`.
- Align GitHub `SITE_URL`, Google callback URLs and Resend domain/from address.
- Redirect old public aliases to the canonical origin instead of serving competing canonicals.

### Tests and acceptance

- unit tests for site-origin resolution and safe fallbacks;
- build/lint/full tests green;
- Preview headers checked without blocking Google/Resend/auth assets;
- canonical, sitemap, robots, calendar and email links share one origin;
- link preview verified in at least one social/debug inspector;
- no admin/API route becomes publicly accessible.

### Rollback

Revert the PR and restore the previous Vercel environment values/alias. Do not remove the old origin until callback and redirect verification is complete.

## PR B — installable PWA

### Files and behavior

- Add `src/app/manifest.ts` with product name, short name, start URL, standalone display, theme/background colours and icon declarations.
- Add branded 192px, 512px, maskable and Apple-touch icons.
- Add a minimal service worker and a small client registration component.
- Add an offline page using the current paper/ink design system.
- Add an install entry point in navigation/settings:
  - use the browser install prompt only where supported;
  - show concise iOS Share -> Add to Home Screen instructions;
  - never show a broken install CTA.
- Exclude `/api`, `/admin`, `/login`, auth/session traffic and all dynamic IPO/GMP/subscription reads from cache.
- Use network-first behavior; only the static shell/offline asset may be retained.
- On activation, remove obsolete named caches so releases do not pin old assets.

### Tests and acceptance

- manifest contains name/short name, valid start URL, standalone display and 192/512 icons;
- icons render without transparent/unsafe padding and pass maskable preview;
- service-worker tests prove sensitive and dynamic routes are never cached;
- offline navigation shows an explicit offline state, not stale financial data;
- install/update/remove tested on Android Chrome, desktop Chrome and iOS Safari Home Screen;
- 390, 768 and 1440px show no overflow and standalone mode preserves navigation;
- Lighthouse PWA checks and Production build pass.

### Rollback

Unregister the worker in a follow-up deployment, invalidate its named static cache and remove manifest installation UI. Because no API data is cached, rollback cannot expose or corrupt user data.

## PR C — monitoring and recovery closure

- Add a public, dependency-light health/readiness contract that exposes no secrets or personal data.
- Configure an external monitor for homepage, representative detail page and cron freshness.
- Alert on repeated ingestion failure, stale successful run, auth entry failure, reminder failure and already-published source drift.
- Deduplicate/cool down alerts to prevent notification storms.
- Document incident ownership, retry/manual controls and data-correction path.
- Perform a Neon restore rehearsal into an isolated target and record RPO/RTO evidence; never overwrite Production during the drill.

## Real-user launch gate

Use one consented non-admin account and record:

- Google sign-in success;
- email sign-in success if displayed;
- watchlist add/remove;
- reminder opt-in, send, receipt and correct deep link;
- failure behavior and unsubscribe/disable path;
- installed-PWA launch and update.

No screenshot/log may expose tokens, full email addresses or session cookies.

## Invite-beta thresholds

Run for seven continuous days with 20-50 invited users. Public beta opens only if:

- scheduled ingestion success is at least 99% and no market data remains stale beyond two expected hourly cycles without a visible degraded state;
- zero unresolved P0/P1 correctness, authentication or privacy issue exists;
- canonical/domain checks remain consistent;
- auth and reminder E2E remain functional;
- external monitoring and restore evidence are complete;
- financial and source gaps remain truthfully labelled.

## Native app decision after beta

Do not build React Native/Expo yet. Revisit after the beta using evidence such as repeat weekly usage, watchlist/reminder adoption and requests for app-store distribution. If justified, the native app should consume a versioned public API and reuse design tokens, not scrape web markup or duplicate business rules.

## Todo

- [x] Owner approved this plan.
- [x] PR A code implementation and local validation.
- [x] PR A Preview proof and merge.
- [ ] Final domain and provider configuration aligned.
- [x] PR B code implementation and local PWA validation.
- [ ] PR B Preview/device proof and merge.
- [x] PR C monitoring/runbook implementation and local validation.
- [ ] PR C Production probe proof and merge.
- [ ] Isolated Neon restore rehearsal evidence.
- [ ] Real-user launch-gate test recorded.
- [ ] Seven-day invite beta completed.
- [ ] Go/no-go public-beta review.

## Approval checkpoint

Implementation begins only after the owner says **plan approved**. Until then, do not change Production configuration, create a service worker or merge launch-related code.

---

# Implementation plan: compact date-first market dashboard

Date: 17 August 2026
Status: approved by owner; implementation in progress.

## Approach

Retain the proven chronology/data contracts and recompose the homepage around one compact market header plus a responsive agenda. The full month calendar remains a secondary view. Missing values become lifecycle-aware text, never invented data.

## Changes required

### 1. Add a pure today-summary contract

**File:** `src/lib/ipo-chronology.ts`

Add a tested helper that counts today’s events by type. The component should not independently duplicate event grouping logic.

```ts
type TodayMarketSummary = {
  opens: number;
  closes: number;
  allotments: number;
  listings: number;
};

export function todayMarketSummary(ipos, now): TodayMarketSummary
```

Keep “open for bidding” derived through the existing `effectiveStatus` contract because it is a lifecycle state, not a calendar milestone.

### 2. Delete the market-timeline hero; use a one-line utility header

**File:** `src/components/IpoBoard.tsx:205-290, 530-575`

- Remove the entire bordered `IPO market timeline / What is happening today—and next` hero and its explanatory paragraph.
- Reduce the editorial `board-intro` to a compact product/coverage line.
- Start the date view with **Today · Monday, 17 August**.
- On the same line (or directly below on narrow screens), show plain counts: `3 open for bidding · 1 closes · 4 allotments · 3 listings`.
- Do not use the word `milestone` in public navigation, counters or headings; say event type directly.
- Do not repeat the methodology disclaimer above the list; GMP and verification context stays on each IPO.
- Move tracked issuer/filing/page coverage into secondary copy rather than primary proof blocks.
- Keep view navigation, but visually prioritize Today, Explore and Calendar; Pipeline remains available without dominating the first row.

### 3. Make the date picker human-readable

**File:** `src/components/IpoBoard.tsx:575-615`

- Keep horizontal seven-day selection and All upcoming.
- Replace `— events` with `No events`.
- Add event-type micro-dots/counts where a day has events so the colour meaning is visible before selection.
- Preserve pressed/keyboard states.

### 4. Recompose agenda records for desktop and mobile

**File:** `src/components/IpoBoard.tsx:615-690`

- Keep semantic table markup for desktop accessibility.
- Add internal wrappers/classes so mobile becomes a deliberately composed card rather than generic `data-label` cells.
- Put company/board before secondary verification details on mobile.
- Combine price, lot and minimum coherently.
- Make allotment the contextual primary action only when a registrar URL exists; otherwise details remains primary.

### 5. Replace generic missing-value copy

**Files:** `src/components/IpoBoard.tsx`, `src/lib/board-helpers.ts`

Add small pure presentation helpers where state depends on lifecycle, for example:

```ts
gmpAvailabilityText(ipo) // "No tracked GMP quote yet"
subscriptionAvailabilityText(ipo, now) // "Bidding opens 20 Aug" / "Awaiting exchange update"
```

Reuse the existing truthful values when present. Do not alter stored data.

### 6. Fix responsive containment and polish

**File:** `src/app/globals.css`

- Guarantee `html`, `body`, `.wrap`, controls, tabs and date content cannot widen the viewport.
- Reduce first-viewport vertical padding and headline size.
- Make the seven-day strip an explicitly contained scroller with visible scroll affordance.
- At ≤700px, render compact agenda cards with a two-column fact grid; at ≤430px allow a one-column fallback only where necessary.
- Keep minimum 44px touch targets, visible focus states and reduced-motion behavior.
- Use the existing paper/ink/orange/green design tokens; do not introduce a new visual language.

### 7. Tests and visual proof

**Files:** `src/lib/ipo-chronology.test.ts`, `src/lib/board-helpers.test.ts`, optionally a focused component markup test.

- Test all four today event counts, including multiple events on one date.
- Test zero-event and lifecycle-aware missing-signal labels.
- Preserve timezone boundary tests.
- Run all tests, lint and Production build.
- Verify Preview at 390, 768 and 1440px with no page-level horizontal overflow.
- Verify Today, future-date selection, All upcoming, Mainboard/SME, Month calendar and allotment/details actions.

## Delivery sequence

1. Implement on `codex/date-dashboard-polish`.
2. Commit and push one focused PR.
3. Wait for CI, migration smoke and Vercel Preview.
4. Perform responsive browser proof on Preview.
5. Merge only after proof is clean.
6. Confirm the managed Production URL serves the merge.

## Rollback

The change is migration-free. Revert the single squash commit to restore the current layout. Chronology data, ingestion and stored IPO records remain untouched.

## Todo list

- [x] Add today event summary helper and tests.
- [x] Add lifecycle-aware missing-signal copy and tests.
- [x] Remove the timeline hero and replace it with the one-line Today utility header.
- [x] Add event summary chips and improved seven-day picker.
- [x] Recompose agenda rows/cards and actions.
- [x] Fix global/mobile containment and responsive styles.
- [x] Run tests, lint and build.
- [ ] Create PR and wait for all checks.
- [ ] Verify responsive Preview interactions and overflow.
- [ ] Merge and verify managed Production.

## Approval checkpoint

Implementation begins only after the owner says **Plan approved**. Do not implement yet.

---

# Hourly market-refresh release

Date: 17 August 2026
Status: approved by owner in conversation; implementation in progress.

## Scope

1. Change the serialized GitHub Actions market workflow from every two hours to every hour.
2. Change public methodology and empty-state copy to the truthful hourly promise.
3. Tighten the stale-GMP threshold from four hours to two hours (double the new cycle) and update boundary tests.
4. Keep filing/PDF work outside the frequent market-data cycle.
5. Run tests, lint and Production build; ship through a dedicated PR and observe the first scheduled cycle.

## Explicitly separate follow-up

Build a dedicated Live GMP decision table based on the competitor research in `research.md`. It will reuse current snapshots and provenance and needs no schema migration, but it is intentionally not bundled into the scheduling change.

---

# IPOBharosa production-closure plan

Date: 15 August 2026
Status: research and planning complete; implementation awaits explicit owner approval.

## Outcome

Move IPOBharosa from a credible private beta to a defensible Production beta by
closing correctness, ingestion, monitoring, UI and operational gaps in small,
reviewable releases. Existing public data will remain available throughout.

The release principle is:

```text
truth before polish -> correct signals before dashboards -> Preview before merge
-> exact commit in Production -> observe real scheduled cycles
```

No release will invent a missing value, turn publication into proof of
verification, or auto-publish financial extraction that lacks reliable source,
page, period, unit and scope evidence.

## Current baseline

Already live:

- date-wise All IPOs and calendar agenda;
- filing/PDF work removed from the two-hour ingestion critical path;
- site-origin/email readiness contract;
- bounded official ZIP acquisition;
- strict official financial-summary extraction;
- 65 IPO records in the latest completed market cycle;
- 100 official filing entries, 29 linked;
- 47 GMP snapshots and 14 subscription snapshots in the latest run;
- nine official financial candidates queued in the latest financial run;
- zero known Production dependency vulnerabilities.

Not yet Production-ready:

- server/client dates can disagree and cause hydration failure;
- lifecycle can remain “Awaiting allotment” after listing;
- a published row can appear Verified without matching source evidence;
- provider non-coverage is counted like provider failure;
- independent health monitoring and baseline browser headers are absent;
- responsive/accessibility evidence is incomplete;
- domain/email, restore rehearsal and real-user beta proof remain open.

## Release sequence

Each release starts from current `origin/main`, gets its own `codex/` branch and
PR, passes CI and Vercel Preview, and is merged only after its acceptance evidence
is reviewed.

```text
PR 6  Public correctness, trust-contract and date-board hotfix
PR 7  Ingestion outcome taxonomy and source-health accuracy
PR 8  Independent Production health and browser hardening
PR 9  Public/admin design-system and responsive-accessibility closure
PR 10 Official-source and financial-coverage expansion
Task  Domain, email, restore and real-user launch gates
```

## PR 6 — public correctness and trust-contract hotfix

Priority: P0. Migration-free and data-preserving.

### 1. One market-date contract

**Files:** `src/lib/ipo-chronology.ts`, `src/lib/board-helpers.ts`, IPO detail and
calendar consumers.

- Add shared date-only parsing/formatting using `Asia/Kolkata` explicitly.
- Make server and client consume the same helper.
- Never derive a market date by formatting a UTC instant in the runtime's local
  timezone.
- Keep timestamps as timestamps; use market-day helpers only for IPO lifecycle
  dates.

### 2. Separate lifecycle from listing performance

**Files:** `src/lib/ipo-status.ts`, `src/lib/board-helpers.ts`, chronology tests.

- Derive lifecycle from open, close, allotment and listing dates.
- Once listing day has passed, display `Listed` even when listing price is absent.
- Display listing performance separately as `Listing price pending`.
- Preserve the stored enum initially; this PR changes effective public state,
  not historical rows.

### 3. Make verification claims evidence-bound

**Files:** `src/lib/public-verification.ts`, `src/lib/board-data.ts`, verification
badges/copy.

- Treat publication state and verification state independently.
- `VERIFIED` requires the configured official core fields, provider/source URL
  and successful comparison evidence.
- A published row with missing evidence remains public but says
  `Published · source evidence incomplete`.
- A real conflict says `Needs review`; a temporary official-source problem says
  `Verification retrying`.
- Show checked fields and clickable official sources when available.
- Do not downgrade already proven records whose current captures satisfy the
  contract.

### 4. Fix misleading or incorrect actions

**Files:** `src/components/IpoBoard.tsx`, `src/app/ipo/[slug]/page.tsx`,
`src/lib/calendar.ts`, login page.

- Remove “open the filing below” when there is no filing link.
- Make the detail-page Google Calendar action actually scope to that IPO, or
  clearly relabel it as the All IPOs calendar.
- Make the IPO brand/logo on login a Home link and retain a safe return path.

### 4a. Make the calendar/date board operationally useful

**Files:** `src/components/IpoBoard.tsx`, `src/lib/ipo-chronology.ts`,
`src/app/globals.css`, calendar tests.

- Put all events occurring today at the top of the calendar agenda.
- Give Opens, Closes, Allotment and Listing distinct accessible colour/tone
  treatments; colour is never the only signal because every card also carries
  an explicit event label.
- Use plain labels such as `Opens today`, `Closes today`, `Allotment today` and
  `Listing today`.
- Within today, use lifecycle order: close, allotment, listing, open; then order
  IPOs consistently by company name.
- Place future events below today in ascending date order with `Tomorrow` or the
  exact market date.
- When a calendar day is selected, show that day's complete agenda; otherwise
  show a continuous Today + Upcoming date board rather than only a small slice
  from the current month.
- Calendar subscription/download failures must surface as real error responses;
  the Google subscription URL and `.ics` route must use the same event set.

### 5. Correct card interaction semantics

**File:** `src/components/IpoBoard.tsx`.

- Remove `role="button"` from the full card.
- Use a normal detail link for card navigation.
- Keep watchlist and compare as sibling controls with their own labels.
- Preserve click/touch usability without nested interactive semantics.

### Tests

1. the same ISO value renders the same IPO date under UTC and Asia/Kolkata;
2. server markup and client first render have identical date text;
3. a closed IPO past listing day becomes Listed without listing price;
4. absent listing price shows pending performance, not awaiting allotment;
5. publication without source match is not Verified;
6. official matched core fields with provider/source URL are Verified;
7. conflict and retry states remain distinct;
8. missing filing renders no dead filing CTA;
9. per-IPO calendar link includes the IPO scope;
10. cards contain no nested button-like composite.
11. today events appear before all future events;
12. today event labels and tones distinguish open/close/allotment/listing;
13. future events sort chronologically across month boundaries;
14. selected-day agenda contains every event on that day;
15. calendar feed and visible date-board event contracts agree.

### Preview acceptance

- No hydration warnings on Board, All IPOs, Calendar or two detail pages.
- Dates agree in the header, overview, calendar and ICS.
- Verification wording agrees with the displayed evidence.
- Keyboard-only detail, compare, watchlist and login/Home journeys work.
- Check 360, 390, 768, 1024 and 1440 px.

### Rollback

Revert PR 6. It has no schema mutation and does not rewrite source evidence.

## PR 7 — ingestion outcome taxonomy and source-health accuracy

Priority: P0/P1. Prefer an additive code contract; use existing flexible run
summary storage where possible.

### 1. Typed adapter result

**Files:** GMP/subscription adapter contracts, adapters, `src/lib/gmp/ingest.ts`,
`src/lib/ingestion/run-cycle.ts`.

Replace boolean/exception ambiguity with:

```ts
type ProviderResult<T> =
  | { kind: "VALUE"; value: T }
  | { kind: "NOT_YET_AVAILABLE"; reason: string }
  | { kind: "NOT_COVERED"; reason: string }
  | { kind: "ERROR"; category: "timeout" | "http" | "parse" | "unknown"; retryable: boolean };
```

- 404/missing company page -> `NOT_COVERED` when provider semantics confirm it.
- valid page without a published datum -> `NOT_YET_AVAILABLE`.
- timeout/429/5xx -> retryable `ERROR`.
- unexpected markup/invalid value -> parser `ERROR`.
- Only `ERROR` affects outage/degraded source health.

### 2. Bound market-data windows

- GMP refresh: upcoming/open and a documented limited post-listing window.
- Subscription refresh: open plus a limited close/finalisation window.
- Do not retry historical listed IPOs forever because listing price is missing.
- Keep an admin `Retry now` action for a specific IPO/provider exception.

### 3. Make retries and cooldown real

**File:** `src/lib/ingestion/source-operation.ts` and call sites.

- Use `withTransientRetries` for timeouts, 429 and 5xx only.
- Honour persisted `nextRetryAt` before a new attempt.
- Apply longer cooldown to deterministic access/parse failures.
- Reset consecutive failures after a successful probe.
- Deduplicate the same open conflict/incident during cooldown.

### 4. Honest source health and run summaries

Per source and total, publish:

```text
value | not_yet_available | not_covered | error
success rate among attempted covered records
last success | consecutive errors | next retry | degraded reason
```

- Set `degraded` from documented error-rate/consecutive-error thresholds.
- Keep coverage gaps visible without paging them as outages.
- Add exact IPO/provider/error category to admin drill-down.

### 5. Better alerts

- Alert on complete outage, sustained high error rate, stale last-success and
  published-data drift.
- Do not alert merely because a provider does not cover an IPO.
- Keep GitHub workflow failure as an independent signal until email is proven.

### Tests

1. 404/missing company page is not provider outage;
2. valid empty table is not-yet-available;
3. timeout/5xx increments source errors and retries with bounds;
4. parser regression degrades the provider after threshold;
5. persisted cooldown prevents repeated calls;
6. successful probe resets error streak;
7. subscription stops after its finalisation window;
8. old closed/listed IPO is not polled forever;
9. duplicate conflict does not create a new incident each cycle;
10. run summary totals reconcile exactly to attempted records.

### Production acceptance

- Run no-write comparison against the latest 65-record inventory.
- Review the before/after classification for every former “failure”.
- Merge and observe three consecutive scheduled cycles.
- No unexplained `ERROR`; value/no-data/non-coverage totals reconcile.
- GMP and subscription snapshots continue advancing.

### Rollback

Revert the adapter/result release. Preserve all existing observations and
incidents; do not delete historical run summaries.

## PR 8 — independent Production health and browser hardening

Priority: P1. Migration-free.

### 1. Health evaluator and endpoint

**New files:** `src/lib/health.ts`, `src/app/api/health/route.ts`.

Read-only checks:

- application/build responds;
- database can complete a bounded read;
- public catalogue is non-empty;
- latest completed successful market ingestion is no older than five hours;
- latest filing/financial worker timestamp is exposed as informational health;
- open critical published-data drift count is zero.

Return bounded JSON, `Cache-Control: no-store`, HTTP 200 for healthy and 503 for
degraded. Never expose credentials, raw payloads or exception text.

### 2. Independent GitHub monitor

**New file:** `.github/workflows/production-health.yml`.

- Run every 15 minutes and on manual dispatch.
- Retry only transient transport errors.
- Require valid JSON and healthy state.
- Five-minute timeout and read-only permissions.
- Keep this independent of Resend.

### 3. Baseline security headers

**Files:** `src/lib/security-headers.ts`, `next.config.ts`.

- disable `x-powered-by`;
- `X-Content-Type-Options: nosniff`;
- `X-Frame-Options: DENY`;
- `Referrer-Policy: strict-origin-when-cross-origin`;
- restricted camera, microphone, geolocation, payment and USB permissions.

Do not enforce CSP in this PR. Capture a report-only CSP after Auth and Next.js
asset requirements are measured.

### 4. Fix smoke semantics

Update `scripts/smoke-preview.mjs` to call `/api/health` instead of treating an
admin extraction route as health. Continue to prove unauthenticated mutation and
admin routes remain closed.

### Tests and acceptance

- recent, stale, missing and exact five-hour boundary cases;
- DB exception returns bounded 503 without internal text;
- empty catalogue is degraded;
- required headers present once;
- Preview root/detail/login/health all respond correctly;
- Production monitor is green after exact-commit deployment.

### Rollback

Revert PR 8 or disable only the monitor if the threshold is noisy. No data or
schema rollback is needed.

## PR 9 — UI/design-system and admin workflow closure

Priority: P1/P2. No feature rewrite.

### 1. Public responsive pass

- Use existing white/orange IPOBharosa tokens and components.
- Make view/filter overflow obvious on small screens; no hidden controls.
- Keep 44 px touch targets and visible keyboard focus.
- Add consistent loading, empty, retrying and error states.
- Keep verification badges paired with plain-language explanation and clickable
  source links.
- Ensure Board, All IPOs, Pipeline, Calendar and Detail use one spacing/type/
  badge/button system.
- Respect `prefers-reduced-motion`; transitions remain restrained (120–180 ms).

### 2. Admin information architecture

Separate operational work into:

```text
Needs attention | Retrying | Source health | Financial evidence | History
```

- Present exact reason and next action.
- Add `Retry now` only for retryable items.
- Group manual financial fields by source, period/scope, value/unit and decision.
- Show source URL, page/table, extracted value, prior published value and
  confidence together.
- Keep actor and reason on approve/reject/correct operations.
- Replace page-specific inline styles with shared design primitives.

### 3. Browser/accessibility evidence

- Fresh Preview at 360, 390, 768, 1024 and 1440 px.
- No body overflow or clipped primary action.
- Keyboard navigation and focus order.
- Screen-reader names for filters, cards, calendar dates and admin controls.
- Dark mode is not added unless designed and tested end to end.

### Tests and rollback

Add component/contract tests for state labels and semantic controls; record
screenshots for the supported breakpoints. Revert PR 9 without touching data.

## PR 10 — official-source and financial-coverage expansion

Priority: P1 product coverage, but never at the expense of evidence quality.

### 1. Filing linkage and coverage

- Reconcile the 100-entry filing catalogue with the 29 currently linked records.
- Match using issuer identity plus document type/date; never name-only blind
  merges.
- Show tracked issuers, official filings and complete IPO pages as separate
  inventory levels.
- Expose clickable exchange/SEBI/registrar source URLs and capture timestamp.

### 2. Financial pipeline

- Improve document acquisition/checksum coverage.
- Locate the correct audited/consolidated/standalone financial tables.
- Extract metric, value, unit, fiscal period, scope, audit/restatement status,
  source URL, page and table label.
- Reject ambiguous year/unit/scope automatically into the exception queue.
- Publish only immutable accepted revisions; never overwrite history.
- Alert if a newer official filing contradicts a published value.

### 3. Coverage reporting

Per IPO expose:

```text
official terms: verified | retrying | conflict | unavailable
filing: linked | candidate | unavailable
financials: published | awaiting evidence | review required | unsupported layout
GMP/subscription: source coverage and freshness
```

### Acceptance

- all automated links have deterministic evidence;
- every remaining unlinked/deferred record has one exact reason;
- financial candidates show full provenance;
- no auto-published ambiguous financial value;
- public UI never confuses missing data with zero.

## Owner-operated launch tasks

These are not hidden inside code PRs because they change external accounts,
security or public commitments.

1. Buy/select custom domain; connect Vercel and verify DNS.
2. Verify Resend sender domain; set `SITE_URL`, `NEXT_PUBLIC_SITE_URL` and enable
   user email only after delivery proof.
3. Publish approved Terms, Privacy, Disclaimer and correction/support contact.
4. Rotate Production DB credentials into sensitive environment variables during
   a controlled window.
5. Run and time a backup restore/read rehearsal.
6. Complete one external user journey: Google login -> browse/filter -> detail
   evidence -> watchlist -> calendar -> reminder -> remove/unsubscribe.
7. Resolve branch-protection enforcement through repository plan/visibility or
   maintain documented PR-only process control until then.

## PR 9A — date-first homepage ledger

### Approach

Make the user's primary IPO question—“what happens today and next?”—the default
root experience. Reuse the existing lifecycle event, verification and calendar
contracts. Do not change the database, ingestion rules or public trust labels.

### 1. Add a dedicated homepage date ledger

**Files:** `src/components/IpoBoard.tsx`, `src/lib/ipo-chronology.ts`

- Add a `dates` public view and make it the stable default.
- Keep the existing Board/All IPOs views for deeper exploration and comparison.
- Always render a Today group, even with zero milestones.
- Follow Today with chronological future groups; default window is the next
  seven market days with an All dates expansion.
- Add a compact seven-day date strip so a user can jump directly to a date.
- Reuse `lifecycleEventsByDay`, `marketDayKey`,
  `sortCalendarAgendaEvents` and `calendarEventTimingLabel`; do not implement a
  second date model.

### 2. Render a decision-grade colour-coded table

**File:** `src/components/IpoBoard.tsx`

Desktop columns:

1. lifecycle event and exact date;
2. company, Mainboard/SME and verification state;
3. price band, lot and minimum investment;
4. GMP value/percentage, confidence and freshness, explicitly unofficial;
5. retail/overall demand or honest pending state;
6. contextual action: official allotment check when applicable, otherwise full
   details and sources.

Rows use the IPO's current public verification state; unverified values remain
visible but clearly labelled. Allotment links use the existing registrar helper
and never imply allotment is available when it is not.

### 3. Apply the existing design system responsively

**File:** `src/app/globals.css`

- Today date band: green tint/border and stronger heading.
- Opens: green/teal pill; Closes: amber; Allotment: violet/orange; Listing: blue.
- Neutral white surfaces, restrained borders and tabular numbers.
- Sticky desktop column header only when it does not obscure group labels.
- Under 760 px, rows become two-column stacked records with the action full
  width; no page-level horizontal overflow.
- Maintain keyboard focus, table semantics on desktop, readable touch targets
  and reduced-motion compatibility.

### 4. Keep calendar sync secondary but reachable

**File:** `src/components/IpoBoard.tsx`

- Put “Add all dates” beside the date-ledger heading.
- Keep the full month Calendar view for browsing/selecting a day.
- Keep the verified live ICS URL and the explicit Google desktop fallback.

### Test strategy

- Pure tests for Today-empty, Today-with-events, next-seven-day filtering,
  chronological grouping and event priority.
- Component/build gates ensure the stable server timestamp remains required.
- Preview browser checks at 390, 768, 1024 and 1440 px.
- Verify: no hydration warning, no horizontal overflow, Today is first, all four
  colours have text labels, Mainboard/SME filters work, allotment action goes to
  the registrar, detail links work and calendar feed remains valid.
- Production smoke only after PR checks and Preview evidence pass.

### Rollback

Revert PR 9A. No schema, source data, auth, ingestion or migration state changes
are involved.

### Todo

- [x] Add date-window/grouping tests.
- [x] Build the Today-first homepage ledger and seven-day strip.
- [x] Build the semantic desktop table and mobile record layout.
- [x] Wire filters, contextual allotment/detail actions and calendar controls.
- [x] Run full test/lint/type/build gates.
- [ ] Verify responsive Preview and hydration/accessibility behaviour.
- [ ] Merge and smoke-test the exact Production commit.

## Standard gate for every PR

```bash
npm run lint
npm test
npx tsc --noEmit
npm run build
npx prisma validate
```

Also run affected Python tests, migration tests when schema changes exist,
Preview smoke, responsive browser checks and exact-commit Production smoke.
Never run a destructive Production migration. Any future additive migration gets
a backup, no-write Preview validation and explicit migration approval.

## Final Production-beta exit criteria

- [ ] PR 6 correctness contract live; no hydration/date/verification contradiction.
- [ ] PR 7 live; three scheduled cycles reconcile typed outcomes.
- [ ] PR 8 live; health monitor and security headers verified.
- [ ] PR 9 responsive/accessibility evidence accepted.
- [ ] Critical official-source conflicts are zero or explicitly held.
- [ ] Financial coverage is honest and fully provenance-linked.
- [ ] Custom domain and real email/reminder journey pass.
- [ ] Terms/Privacy/Disclaimer/correction path are public.
- [ ] Restore rehearsal passes within the accepted recovery target.
- [ ] One external beta user completes the journey without operator help.

## Todo

- [x] Audit current Production code, UI routes and trust boundaries.
- [x] Audit current GMP, subscription, filing and financial run evidence.
- [x] Audit auth, environment, domain, security and monitoring boundaries.
- [x] Write the expanded production-closure plan.
- [x] Obtain explicit approval for this expanded plan.
- [x] Implement and validate PR 6. (Local/CI gates and desktop/mobile Preview browser evidence complete; Production smoke follows merge.)
- [ ] Implement and observe PR 7 for three Production cycles.
- [ ] Implement and validate PR 8.
- [ ] Implement and validate PR 9.
- [ ] Implement PR 10 in bounded coverage slices.
- [ ] Complete owner-operated launch tasks and sign off Production beta.

## Approval checkpoint

No implementation starts until the owner explicitly says:

```text
Production closure plan approved
```

Approval authorises the code work in PRs 6–10 one bounded PR at a time. It does
not authorise domain purchase, billing/plan changes, public email enablement,
credential rotation, destructive database work or public legal publication;
those remain explicit owner actions.
# Compact agenda and SME GMP coverage

Status: implementation requested by owner on 17 Aug 2026.

- [DONE] Replace oversized tablet agenda cards with a compact information grid.
- [DONE] Keep a dedicated phone layout without hiding price, minimum, GMP, demand or actions.
- [DONE] Add a cached InvestorGain GMP adapter and safe SME name aliases.
- [DONE] Reject absent (`--`) quotes instead of presenting them as ₹0.
- [DONE] Publish successful InvestorGain observations in public provenance.
- [DONE] Run 279 unit tests, zero-warning lint, production build and live adapter verification.
- [DONE] Verify the Vercel Preview at 768px and 390px: compact rows/cards render without document overflow and retain every decision field.
- [IN PROGRESS] Merge, run production ingestion and confirm populated/absent SME quotes.
# Scrollable IPO rows

Status: owner explicitly redirected the approved responsive layout on 17 Aug 2026.

- [DONE] Preserve semantic table rows at every viewport.
- [DONE] Put IPO/company first and make it sticky below 840px.
- [DONE] Enable touch-friendly horizontal scrolling with dense fixed-width columns.
- [DONE] Run 279 tests, zero-warning lint and production build.
- [DONE] Verify Preview at 768px/390px with no document overflow.
- [DONE] Programmatically scroll the table 300px and confirm the IPO column remains fixed at the same left position; 560px of horizontal detail is available on phone.
- [IN PROGRESS] Merge and verify Production.
