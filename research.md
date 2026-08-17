# Launch data-reliability implementation evidence — 17 August 2026

The approved launch-gap bundle was re-audited against current `origin/main` before implementation. The main defect was confirmed: GMP and subscription adapters represented expected absence and provider non-coverage by throwing, so hourly ingestion treated missing SME coverage like a provider outage. Closed IPOs also remained eligible for subscription/GMP polling without a finalisation bound.

The bounded release implements a four-outcome contract (`VALUE`, `NOT_YET_AVAILABLE`, `NOT_COVERED`, `ERROR`) without a schema migration. Only `ERROR` now increments failure/degraded health. Public GMP empty states are derived from the latest per-provider observations, so the site can distinguish “not published”, “not covered” and “source check failed/retrying”. Subscription and GMP polling stop two days after the closed IPO's listing/finalisation window. Watchlist reminder links now open the exact IPO detail page.

Live adapter proof after the change:

- Credent Connect: InvestorGain returned ₹55; Sahi was `NOT_COVERED`; IPO Ji was `NOT_YET_AVAILABLE`.
- Skytech Infinite Platform: IPO Watch and InvestorGain both returned ₹7.
- Technocrats Plasma: InvestorGain returned ₹32; other expected gaps were classified without inventing zero.
- ENS Enterprises: no tracked source published an active quote; this is now expected absence/non-coverage rather than four outages.
- The live subscription adapter returned exchange-attributed category values for Dhoot Transmission, Molbio Diagnostics and Technocraft Ventures.

IPO Watch was unreachable from the verification environment and correctly remained a real retryable error. This is exactly the distinction the new contract is intended to preserve.

---

# Research: public-launch gates and installable app strategy

Date: 17 August 2026

## Executive finding

IPOBharosa is technically strong enough for a small invite-only beta, but it is not ready for an unrestricted public launch today. The hourly ingestion path is stable and the core public experience works; the remaining blockers are trust, identity, real-user delivery proof and recovery—not another large product rewrite.

The first app should be an **installable Progressive Web App (PWA)** using the existing Next.js product. A separate iOS/Android codebase would duplicate UI, authentication, analytics and release work before the product has retention evidence. A PWA gives an app icon, standalone window and one shared release path without app-store approval. Native apps should be reconsidered only after beta usage proves a store-distributed app or deeper device capability is valuable.

## Evidence reviewed

- The current Next.js repository, layout metadata, authentication, email readiness, sitemap, robots contract, ingestion alerts and admin source-health UI.
- The managed Production origin `https://ipodekho-ten.vercel.app` and its public, legal and authentication routes.
- The latest 30 hourly ingestion workflow runs: all 30 completed successfully, with no failed or pending run in the sample.
- Current GitHub launch-readiness and financial-pipeline issues.
- Current PWA requirements from Next.js, Chrome and Apple documentation.

No Production data or configuration was changed during this audit.

## What is ready

- Mainboard and SME IPO discovery, chronological browsing, detail pages and transparent verification states are live.
- Hourly ingestion is serialized, resumable and currently healthy.
- Google authentication is exposed; email authentication is conditionally exposed only when transport, sender, feature flag and site URL are configured.
- Privacy, Terms and Disclaimer pages are live.
- Source health, retry state, official-evidence conflicts, ingestion alerts and admin visibility already exist.
- The release foundation has a recorded Production migration baseline and a recoverable Neon backup branch.

## Hard gates before public launch

### 1. Establish one canonical public identity

The visible deployment is `ipodekho-ten.vercel.app`, but live `robots.txt`, `sitemap.xml` and IPO canonical metadata currently point to `ipobharosa.vercel.app`. This splits SEO signals and can also make authentication callbacks, calendar URLs and reminder links disagree.

Required outcome:

- choose and connect the final custom domain;
- set the same origin in Vercel `SITE_URL` and `NEXT_PUBLIC_SITE_URL` and in GitHub `SITE_URL`;
- update Google OAuth, Resend sender/link configuration and any Vercel aliases;
- verify canonical tags, sitemap, robots, calendar feeds, auth callbacks and email links all use that origin.

### 2. Prove one complete real-user journey

Configuration presence is not delivery proof. Before launch, one consented non-admin user must complete:

```text
sign in -> save IPO -> enable reminder -> receive reminder -> open correct IPO -> remove reminder/sign out
```

Test Google and email sign-in separately if both are advertised. Record delivery status without storing secrets or unnecessary personal data.

### 3. Add independent monitoring and a rehearsed recovery path

Ingestion alerts exist, but launch requires an external check that can notice when the application itself cannot report failure. Monitor homepage, a representative IPO page, auth entry point and cron freshness. Route failures to a channel that will be acted on. Perform and document one database restore rehearsal with recovery time and data-loss window.

### 4. Apply baseline browser and abuse protection

Production has HSTS, but the audited response did not expose a Content Security Policy, frame restriction, MIME-sniffing protection or referrer policy. Add tested response headers and verify admin/API authorization boundaries. Add or verify bounded rate controls for authentication and state-changing endpoints; do not rate-limit static public reads aggressively.

### 5. Close the public data-use checklist

The product already shows source and verification context, but a public launch needs an explicit source-use and takedown process: attribution links, contact path, source-specific terms review and a documented correction workflow. This is especially important for unofficial GMP sources. Product copy must continue to separate official issue terms from unofficial GMP.

## Important but beta-safe gaps

- Official RHP financial extraction and review issues remain open. Beta may launch with financials labelled unavailable/pending, but must not claim complete financial coverage or publish uncertain values.
- Social previews are weak because the base layout does not define complete Open Graph/Twitter metadata or a share image.
- A checked-in environment template and concise operator runbook are still needed.
- Provider-neutral IPO application is a later regulated integration; it should not be included in this launch or represented as live.

## PWA product decision

The initial app is a thin, safe installation layer—not an offline financial database.

### Include in v1

- branded manifest with name, short name, start URL, theme/background colours and standalone display;
- 192px, 512px and maskable app icons plus Apple touch icon;
- service-worker registration with versioned, minimal shell handling;
- install guidance that works on Android/desktop and explains iOS Share -> Add to Home Screen;
- standalone-safe navigation and responsive QA;
- offline page for loss of connectivity.

### Do not include in v1

- stale-first caching of IPO, GMP, subscription, authentication, admin or API responses;
- background trading/application behavior;
- push notifications before consent, domain and reminder delivery are proven;
- an app-store wrapper presented as a native product.

Market data should remain network-first because freshness and provenance are part of the product promise. Authentication, admin and API routes must never be placed in a public cache.

## Release recommendation

1. Fix canonical domain, headers and social metadata.
2. Ship the installable PWA on Preview and test install/update/offline behavior.
3. Complete monitoring, restore rehearsal and real-user reminder proof.
4. Run a 7-day invite beta with 20-50 users.
5. Open public beta only if ingestion freshness, auth success, email delivery and error rates remain within the launch thresholds in the implementation plan.

## Primary platform references

- Next.js PWA guide: https://nextjs.org/docs/app/guides/progressive-web-apps
- Next.js manifest convention: https://nextjs.org/docs/app/api-reference/file-conventions/metadata/manifest
- Chrome installability manifest requirements: https://developer.chrome.com/docs/lighthouse/pwa/installable-manifest
- Apple Web Push for Home Screen web apps: https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers

---

# Research: date-first homepage information hierarchy and responsive UX

Date: 17 August 2026

## Scope and evidence

Reviewed the current public homepage and the latest managed Production deployment at desktop (1440px) and mobile (390px), then traced the UI through:

- `src/components/IpoBoard.tsx:170-680` — navigation, public views and date-ledger rendering;
- `src/components/IpoBoard.tsx:730-840` — catalogue rows and major IPO facts;
- `src/lib/ipo-chronology.ts:1-190` — market-day grouping, event priority and date sorting;
- `src/app/globals.css:170-550` — masthead, hero, controls, catalogue and date ledger;
- `src/app/globals.css:990-1060` — global mobile rules.

The existing date model is sound: dates are normalized to `Asia/Kolkata`, lifecycle events are typed as opens/closes/allotment/lists, today is always retained, and events sort deterministically. This release needs no schema migration and should not rebuild the calendar data layer.

## What is working

- Date-first is the right homepage default for the user question: “what is happening today and next?”
- Mainboard and SME already share one chronology with a working filter.
- The seven-day selector and “All upcoming” mode provide better progressive disclosure than opening a full month calendar first.
- Each row already has the right raw facts: event, company/type/verification, price/minimum, GMP/context, demand and relevant actions.
- Full month calendar and calendar subscription already exist as secondary tools.

## What is not working

### 1. The first viewport has two competing hero sections

`board-intro` uses up to 76px top spacing and a 70px editorial headline, then `date-ledger-hero` introduces a second large headline. Users must cross branding, inventory counters, view tabs, type filters and another hero before reaching actual IPOs. The valuable market rows start too low.

### 2. Inventory numbers lead instead of today's decisions

“153 tracked issuers / 93 filings / 60 pages / 3 GMP sources” explains coverage but is not what a returning user needs first. The primary summary should instead expose today’s opens, closes, allotments, listings and currently open issues. Coverage belongs in a quieter secondary line.

### 3. Empty/missing states look synthetic

- The seven-day strip displays `— events` for a zero-event day.
- Missing GMP says generic “Not available / No observation captured”.
- Demand can repeat a generic “Subscription data pending”.

These are truthful but mechanically phrased. They should explain the lifecycle: “No IPO milestone”, “GMP not quoted by tracked sources”, “Bidding not open” or “Awaiting exchange update”. No value should be fabricated or replaced by zero.

### 4. Mobile is not actually composed for the viewport

The 390px capture visibly clips headings, counters, navigation and content on the right. The table-to-card CSS at `globals.css:527-550` helps individual rows, but page-level elements still create horizontal overflow. The mobile cards also retain desktop `data-label` table anatomy, producing tall, repetitive “EVENT / IPO / PRICE” blocks instead of a deliberate mobile record.

### 5. Important details lack a clear reading order

On desktop the row is complete but every column has similar weight. On mobile the company name appears only after the event label. The intended scan order should be:

```text
Date/event urgency → company + Mainboard/SME → price + minimum
→ GMP/demand with freshness → verification → action
```

## Product decision

Use a **date agenda**, not a month calendar, as the homepage. A month grid is useful for navigation but too sparse for price, lot, GMP, demand, verification and actions. The homepage should combine a compact today summary, horizontal seven-day picker and grouped agenda; “Month calendar” remains a secondary action.

## Target experience

### Above the fold

1. Compact brand/navigation.
2. A single utility heading: **Today · Monday, 17 August**.
3. One plain-language summary line: `3 open for bidding · 1 closes · 4 allotments · 3 listings`.
4. Mainboard/SME filter and seven-day picker.
5. First actual IPO row/card.

The standalone white “IPO market timeline / What is happening today—and next” card should be removed entirely. It repeats the selected tab/date, consumes a large part of the viewport, and introduces internal vocabulary (“milestones”) instead of helping the user act. The generic methodology sentence also does not belong above the market list; verification/GMP context already appears on each IPO and in Methodology.

### Desktop agenda row

- event colour rail/pill and relative timing;
- company, board and concise verification state;
- price band, lot and minimum in one high-priority cluster;
- GMP with `% over cap`, freshness and source agreement;
- demand using retail/overall when present;
- one primary contextual action plus a quiet details link.

### Mobile agenda card

- event band + relative date at the top;
- company and board immediately below;
- 2×2 fact grid for price/minimum, GMP and demand;
- short verification line;
- full-width contextual action;
- no desktop table labels and no page-level horizontal scrolling.

### Empty states

- Zero date count: `No milestones`.
- GMP absent before sources publish a quote: `No tracked GMP quote yet`.
- Subscription before opening: `Bidding opens [date]`.
- Subscription during bidding but not captured: `Awaiting exchange update`.
- No events on selected day: keep the selected date and show currently open IPOs as a useful fallback.

## Constraints

- Do not imply a GMP prediction or invent missing values.
- Preserve source-agreement, verification and freshness context.
- Preserve the existing month calendar and calendar feed.
- Preserve Mainboard/SME filtering across the agenda.
- Do not introduce a new dependency or schema migration.
- Fix the public domain/deployment alias separately; UI code alone cannot move an inaccessible Vercel alias.

---

# Research: hourly market refresh and live-GMP competitor patterns

Date: 17 August 2026

## Production cadence evidence

- Production market ingestion currently runs from GitHub Actions every two hours because Vercel Hobby native cron is daily-only.
- The latest 12 scheduled runs all succeeded.
- Those runs completed in roughly 91–118 seconds, leaving substantial headroom for an hourly schedule.
- Workflow concurrency is serialized and the API also uses a database ingestion lock plus persisted checkpoints, so a delayed run cannot create a second overlapping cycle.
- IPO pages read live database state (homepage) or revalidate within 30 minutes (detail), so no additional cache architecture is required.
- Hourly GMP snapshots intentionally improve trend resolution. At current IPO volume the additional rows are modest; retention/compaction can be introduced later if history grows materially.

## Competitor review

### IPOWatch

The useful pattern is its immediate live-GMP scan: IPO name, current GMP, trend, price band, implied listing value, lifecycle dates/type/status and an explicit last-updated value. The drawbacks are ad/SEO density, a single opaque GMP claim and an implied listing value that can look more predictive than it is.

### Chittorgarh

The homepage succeeds as a market directory: Mainboard and SME are visible side-by-side, issue dates are easy to scan and row colour conveys broad lifecycle state. The drawbacks are a large advertising void, legacy navigation density, unclear one-letter colour badges and little evidence context.

### InvestorGain

The strongest pattern is its filter bar (active, open, upcoming, closed, SME, Mainboard, closing today, listed) plus a sortable current-GMP table and explicit updated timestamp. The table is too wide, uses unexplained fire ratings and anchor icons, and depends on horizontal scrolling on smaller screens.

## Product decision

Keep IPOBharosa's date-first homepage as the primary answer to “what is happening today?” Add a separate **Live GMP** view in a follow-up release rather than turning the homepage into a competitor clone. The view should combine fast scanning with IPOBharosa's differentiator:

- median GMP and percentage over the upper price band;
- latest movement from stored hourly history;
- explicit captured time, source count and agreement label;
- open/upcoming/closing-today plus Mainboard/SME filters;
- price, lot, dates and subscription without ratings or advice-like fire icons;
- a desktop table that becomes stacked records on mobile, not horizontal scroll;
- clickable source/evidence links and an “unofficial, not predictive” label beside the figure.

---

# Research: public launch readiness and chronological IPO catalogue

Date: 15 August 2026

## Scope investigated

This research covers what IPOBharosa still needs before a wider public launch and the requested date-wise view that lets a user scan all available IPOs with the major facts needed to open the detail page.

Evidence came from the live Production UI, the current repository, recent GitHub Actions runs, Vercel environment/domain metadata, and the existing public/admin data contracts. No Production values were changed.

## Current live product

The public site already has three useful but separate views:

1. **Board** — 30 complete public IPO records with Mainboard/SME, verification, status, search, compare and watchlist controls.
2. **IPO Pipeline** — 75 official SEBI filing records, including early DRHP/RHP entries that do not yet have complete issue terms.
3. **Calendar** — a month grid with opening, closing and listing dates, Google Calendar subscription and ICS download.

The live headline counts are 105 tracked issuers, 75 official filings and 30 complete public IPO records. The last verified Production database state contains 64 IPO rows across published, draft, quarantined and rejected states. These numbers are not contradictory: each view represents a different completeness/trust boundary.

### What is confusing for a user

- The Board is optimized for cards and current status, not for a chronological market scan.
- The Calendar gives date awareness but each cell shows only the company name and one event colour.
- The Pipeline has official early filings but is not a substitute for final issue terms.
- A user cannot currently answer, in one compact view: “what opens/closes/lists next, what are the price/lot/minimum/GMP, and how well is each record verified?”
- Showing 105 tracked issuers in the hero beside 30 complete cards can look like missing data unless the boundary is explained.

## Existing data is sufficient for the requested view

`BoardIpo` already provides the fields needed for a useful chronological catalogue:

- company, sector, Mainboard/SME and lifecycle status;
- public verification state and explanation;
- opening, closing, allotment, refund and listing dates;
- price band, lot size, minimum investment and issue size;
- GMP median, source agreement and staleness;
- subscription totals/categories when available;
- registrar, official documents and field-level source provenance;
- detail-page slug, watchlist and calendar actions.

No schema migration is required for the catalogue or calendar-agenda feature.

## Recommended information architecture

```text
Board        = decision cards for open/upcoming/listed IPOs
All IPOs     = chronological, high-density catalogue of complete IPO records
Pipeline     = early official filings awaiting final issue terms
Calendar     = month navigation + detailed agenda for a selected date
IPO detail   = full evidence, official sources, subscription, GMP and financials
```

The views must not blur verification states:

- `VERIFIED`: the core issue terms match the supported official-source policy.
- `PENDING`: complete enough to display, but official verification is retrying.
- `NEEDS_REVIEW`: complete enough to display, but an official conflict or exception exists.
- Rejected non-IPO products remain outside the public IPO catalogue.
- Early filings lacking final price/lot/dates remain in Pipeline, not fabricated into All IPOs.

## Date-wise catalogue UX

The new **All IPOs** view should be sorted by the next meaningful lifecycle date by default, with a switch for newest/oldest opening date. It should group records by actual date/month rather than rely on card order.

Each desktop row and mobile card should show:

- opening-to-closing range and listing date;
- company, board type, status and verification badge;
- price band, lot, minimum investment and issue size;
- GMP plus freshness/source-agreement label;
- subscription summary when available;
- source/evidence status;
- actions for details, watchlist and single-IPO calendar.

Filters should reuse the existing Mainboard/SME, lifecycle status, verification and company/sector search contracts. The result count must describe the current filtered set.

## Calendar UX

The month grid should remain compact. Putting price, lot, GMP and verification inside seven-column day cells would become unreadable on both desktop and mobile.

The safe pattern is:

1. add **Allotment** as a visible event type so the grid matches the ICS contract;
2. make each date selectable;
3. render a chronological agenda below the grid for the selected date/month;
4. show the same major-detail summary and verification badge in agenda cards;
5. retain Google live subscription and ICS download;
6. preserve Mainboard/SME filtering in both grid and agenda.

## Automation and data reliability findings

### Main ingestion

The two-hour workflow is resumable and usually succeeds, but the latest scheduled failure is a real launch blocker:

- the workflow reached the hard limit of 120 HTTP steps;
- revalidation completed, including 10 publications, 14 retries, 3 exceptions and 5 wrong issue types;
- the cycle then stalled in the filing-evidence stage;
- several official PDF downloads timed out or returned 403;
- because the run did not reach GMP, subscription and finalize, the whole scheduled workflow was marked failed.

The mistake is coupling slow/host-sensitive PDF acquisition to the frequent market-data cycle. Raising the 120-step limit alone would hide the design problem and make completion time unpredictable.

Recommended boundary:

```text
2-hour market cycle
  discovery -> official verification -> published drift -> GMP -> subscription -> reminders

daily filing/financial cycle
  document queue -> bounded download retries -> checksum -> extraction candidates -> review
```

The hot cycle should record filing candidates but not wait for every PDF download.

### Financial extraction

The scheduled financial workflow is green operationally but not producing useful data. Its latest run found six unprocessed filings, skipped five because no complete filing-backed summary metrics were detected, skipped one after HTTP 406, and submitted zero candidates.

Therefore:

- the workflow must not be called “financials complete” merely because CI is green;
- public financials must continue reading only immutable approved `FinancialPublished` rows;
- launch can proceed with an explicit “financials not yet verified” state, but not with guessed values;
- document acquisition, table extraction and review throughput need their own measured milestone.

## Domain, auth and email findings

- Production has Google auth configuration.
- Production has `RESEND_API_KEY` and `AUTH_EMAIL_FROM` variable names configured.
- Vercel reports **zero custom domains** under the account; the site is still on `ipobharosa.vercel.app`.
- Email sign-in is deliberately hidden in the UI.
- A configured key is not proof of DNS/domain verification or real delivery.
- There is no recorded real-user watchlist-to-inbox reminder proof.
- Canonical URLs and email links are hard-coded to the Vercel address in several files, so a custom domain requires an environment-based site URL before cutover.

## Launch gates

### Code gates that can be implemented now

1. Date-wise All IPOs catalogue and detailed calendar agenda.
2. Separate the filing/PDF queue from the two-hour ingestion critical path.
3. Make canonical URLs environment-driven and add an email readiness check/feature flag.
4. Refresh stale delivery/status documentation with current evidence.
5. Add public data-boundary copy so tracked, filed and complete IPO counts are understandable.
6. Add automated tests, responsive checks, accessibility checks and Production smoke coverage for the new view.

### External gates that require the owner

1. Purchase/select the final custom domain.
2. Add Vercel and Resend DNS records and verify the sender domain.
3. Run one real Google sign-in -> watchlist -> calendar -> reminder delivery journey.
4. Approve public Terms, Privacy Policy, financial-data/GMP disclaimer and correction/support contact.

### Work that must remain evidence-driven

1. Draft/quarantined IPOs can be automatically retried and displayed with labels, but cannot all be forced to Verified.
2. Early filings cannot receive fabricated price, lot or dates before official terms exist.
3. Financial values cannot auto-publish until semantic table/year/unit/scope checks are demonstrably reliable.

## Conclusion

The product is a credible private beta today, but not ready for a broad public launch. The fastest defensible sequence is:

1. ship the chronological catalogue/calendar agenda;
2. repair the ingestion critical path and prove three consecutive scheduled cycles;
3. make domain/email/canonical configuration launch-ready;
4. complete one real-user beta proof;
5. continue financial coverage as an independently measured trust pipeline.

## Production-readiness closure audit — 15 August 2026

This follow-up audit was run after PRs 41–45 reached Production. It separates
what is now proven from what still needs engineering or an owner action.

### Proven healthy

- `main` is deployed from merge commit `3df8da6e86e56074086990623cd0c61ee52cb737`.
- The latest CI run and all recent scheduled market-ingestion runs are green.
- Three post-boundary Production ingestion runs completed successfully:
  `31836766490`, `31876774120`, and `31876866771`.
- The repeat run wrote 47 GMP snapshots and 14 subscription snapshots, refreshed
  100 filing-catalogue entries, linked 29 filings, and revalidated four published
  records with zero detected drift.
- The official financial worker now produces evidence instead of only a green
  process status: run `31876658482` queued six Indo-MIM and three Juniper Green
  Energy candidates and had zero submission failures.
- `npm audit --omit=dev` reports zero known production dependency
  vulnerabilities across 206 production dependencies.
- Unauthenticated Production checks confirm `/admin` and
  `/admin/financials` redirect to login, while cron/admin mutation routes reject
  missing credentials.

### Immediate engineering gaps

1. **No independent service-health contract.** The ingestion route is protected
   and writes a durable successful `IngestionRun` (`src/lib/ingestion/run-cycle.ts:111-120`),
   but there is no small public endpoint that proves the web app can reach the
   database and that the last complete ingestion is fresh. The existing Preview
   smoke script calls an admin extraction endpoint and labels it a health check
   (`scripts/smoke-preview.mjs:20-27`), which does not test operational freshness.
2. **No scheduled availability monitor.** GitHub schedules ingestion every two
   hours (`.github/workflows/ingest.yml:3-9`), but nothing checks the public site
   between data runs or fails specifically when successful ingestion becomes
   stale.
3. **Browser hardening is incomplete.** Vercel supplies HSTS, but Production
   currently exposes `x-powered-by: Next.js` and lacks explicit
   `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and
   `Permissions-Policy`. `next.config.ts:3-5` only configures the PostgreSQL
   external package. A strict CSP should be a later report-only rollout because
   introducing it blindly can break Next.js/Auth scripts.
4. **Alert delivery is not independently proven.** Application alerts use the
   same Resend transport as user email. Production has key/from variable names,
   but no custom domain, no `SITE_URL`, and no recorded verified delivery. A
   GitHub health workflow provides a separate first alert channel without
   pretending Resend is ready.

### External or account-level gaps

- Vercel reports zero custom domains. Production remains on
  `ipobharosa.vercel.app`.
- Production does not define `SITE_URL`, `NEXT_PUBLIC_SITE_URL`, or
  `EMAIL_USER_FEATURES_ENABLED`; user email remains correctly disabled.
- GitHub branch protection cannot be enabled on the current private/free
  repository configuration; the API returns HTTP 403 requiring GitHub Pro or a
  public repository. Until the account changes, PR-only discipline is a process
  control, not an enforced control.
- Database connection variables are present as Vercel non-sensitive variables.
  They are not exposed to browser code because they lack `NEXT_PUBLIC_`, but
  project-access visibility should still be reduced by recreating credentials as
  sensitive values during a controlled credential-rotation window.
- The earlier Neon backup branch proves point-in-time recovery material exists,
  but a timed restore-and-read rehearsal has not been recorded.
- No external beta user has completed Google login, watchlist add/remove,
  calendar subscription, and reminder receipt end to end.

### Recommended next bounded release

The first production-hardening PR should remain additive and migration-free:

```text
GET /api/health
  -> database reachable?
  -> at least one public IPO available?
  -> latest successful ingestion no older than five hours?
  -> 200 ok / 503 degraded, no internal exception text

scheduled GitHub health check (15 minutes)
  -> retry transient network errors
  -> fail visibly on non-200 or malformed health JSON

all routes
  -> disable x-powered-by
  -> nosniff, deny framing, strict referrer policy, restricted permissions policy
```

This closes a real detection gap without coupling monitoring to Resend or adding
a new paid vendor. Custom domain/email, branch protection, and restore rehearsal
remain explicit later gates rather than hidden inside this PR.

## Full UI, trust-contract and ingestion audit — 15 August 2026

The owner expanded the closure scope beyond health monitoring. The audit below
uses the current source tree, current Production HTML, current IPO detail/login
routes and the latest Production ingestion/financial runs. One already-open
browser tab contained an older cached bundle, so visual claims from that tab
were not treated as current defects unless the current source confirmed them.
Every release below therefore requires a fresh exact-commit Preview at the
supported breakpoints.

### P0 public correctness defects

1. **Date rendering is not timezone-stable.**
   `src/lib/board-helpers.ts:26-41` formats date-only values without an explicit
   market timezone. Server rendering and an Asia/Kolkata browser can therefore
   render different days. The live IPO detail route exposed React hydration
   error 418 and showed the same listing date as both 24 and 25 August. The
   existing `MARKET_TIME_ZONE` and `marketDayKey` contract in
   `src/lib/ipo-chronology.ts:34-51` should become the single shared date-only
   implementation for server and client.
2. **Lifecycle depends incorrectly on listing-price availability.**
   `src/lib/ipo-status.ts:10-15` deliberately leaves a closed IPO in `CLOSED`
   until a listing price exists, while `src/lib/board-helpers.ts:77` displays
   every such record as “Awaiting allotment”. Historical IPOs can therefore
   remain awaiting allotment indefinitely. Lifecycle must derive from dates;
   listing performance is a separate enrichment state.
3. **The public verification claim can exceed the evidence.**
   `src/lib/public-verification.ts:71-82` maps a published row to `VERIFIED`
   unconditionally. `src/lib/board-data.ts:468-532` can simultaneously return
   no matched fields, provider or source capture. Production consequently showed
   “Automated verification passed” beside “IPO facts not captured yet” and
   “Official filings not captured yet”. Publication status and evidence status
   must be independent. `VERIFIED` requires the configured official core fields,
   source URL/provider and a successful match; missing evidence must be labelled
   honestly rather than silently upgraded.
4. **Financial/document calls to action can point nowhere.**
   `src/components/IpoBoard.tsx:1397-1413` tells users to open the official filing
   even when `filings.length === 0`. The empty state must never promise a link
   that is absent.
5. **Single-IPO Google Calendar action subscribes to every IPO.**
   `src/app/ipo/[slug]/page.tsx:103-106` uses the global subscription URL from
   `src/lib/calendar.ts:73-76`, although the adjacent ICS action is scoped with
   `?ipo=<slug>`. The action must be truly per-IPO or be relabelled as the full
   market calendar.

### UI, mobile and accessibility findings

- Current source already contains Board, All IPOs, Pipeline and Calendar views,
  defaults to Board, and provides Mainboard/SME plus verification/status filters
  (`src/components/IpoBoard.tsx:80-337`). These shipped capabilities should not
  be rebuilt.
- The IPO card is a `div` with `role="button"` and `tabIndex=0` containing a real
  watchlist button and compare checkbox (`src/components/IpoBoard.tsx:754-840`).
  Nested interactive controls inside a button-like composite create ambiguous
  keyboard and screen-reader behaviour. Navigation should be a normal link on
  the title/body, with watchlist and compare as sibling controls.
- Login protection works, but `src/app/login/page.tsx:20-93` provides no direct
  Home/back path and renders a non-clickable brand. It should preserve the safe
  return target and always offer a visible route back to the public catalogue.
- The public filter/view strips use horizontal overflow. Their current behaviour
  must be tested afresh at 360, 390, 768, 1024 and 1440 px, with visible overflow
  affordance, 44 px touch targets, keyboard focus, reduced motion and no body
  overflow.
- Admin pages are functional but visually fragmented. In particular,
  `src/app/admin/financials/manual/page.tsx:28+` is a long inline-styled raw form.
  Admin polish should reuse the same design tokens, group evidence and decision
  fields, expose validation near the field, and retain an auditable actor/reason
  rather than remove accountability.

### Ingestion semantics and operational accuracy

The latest completed Production market run is operationally green, but its
summary shows why “green workflow” is not the same as healthy coverage:

- 65 IPO records processed;
- 100 filing-catalogue entries, 29 linked;
- 47 GMP snapshots and 18 IPOs without a usable GMP value;
- IPO Watch 46 success / 19 failure, IPO Ji 33 / 32, Sahi 16 / 49;
- 14 subscription snapshots from roughly 60 attempts;
- four published records revalidated, all four matched, zero drift.

The current adapter contract collapses expected absence and actual outage into
one failure:

- `src/lib/gmp/ingest.ts:10-37` returns only boolean success/failure;
- GMP adapters throw for missing company pages/tables
  (`src/lib/gmp/adapters/sahi.ts:20-27`,
  `src/lib/gmp/adapters/ipoji.ts:16-29`,
  `src/lib/gmp/adapters/ipowatch.ts:16-38`);
- the subscription adapter throws for 404, absent table and no completed day
  (`src/lib/subscription/adapters/sahi.ts:31-43,68-70`);
- `src/lib/ingestion/run-cycle.ts:270-331` counts all of those outcomes as
  source failures and increments source-health failure counters.

The correct contract needs at least four outcomes:

```text
VALUE              source covered the IPO and returned usable data
NOT_YET_AVAILABLE  source covers it, but the market datum is not published yet
NOT_COVERED        source has no page/product coverage for this IPO
ERROR              timeout, 5xx, invalid response or parser regression
```

Only `ERROR` should degrade source health. Coverage/no-data still belongs in the
run summary so product coverage remains visible.

Further confirmed issues:

- GMP runs for `UPCOMING`, `OPEN` and `CLOSED`; subscriptions run for `OPEN` and
  `CLOSED` (`src/lib/ingestion/run-cycle.ts:26-27`). Because lifecycle can remain
  `CLOSED` forever, old IPOs are retried for subscription forever. Subscription
  refresh needs a bounded finalisation window after close/listing.
- `SourceHealth.degraded` is reset on success but is not set meaningfully on
  repeated failure, making the admin degraded indicator unreliable.
- `withTransientRetries` and persisted `nextRetryAt` exist in
  `src/lib/ingestion/source-operation.ts:36-108`, but adapters do not consistently
  use the retry helper and the main cycle does not honour the persisted cooldown
  before attempting another call.
- `src/lib/ingestion/alert.ts:34-38` alerts only when every GMP source has zero
  success. A severe partial regression such as 49/65 failures from one provider
  can remain silent.
- Email-based alerts are not an independent availability signal while sender
  domain delivery remains unproven.

### Platform, security and release gaps

- There is no independent `/api/health`; `scripts/smoke-preview.mjs:20-27`
  currently labels an admin extraction call as health.
- `next.config.ts` exposes the framework header and does not define nosniff,
  frame, referrer or permissions-policy headers. CSP should first ship in
  report-only mode after measuring Auth/Next.js requirements.
- `src/app/page.tsx:7` disables revalidation and builds the public root from live
  state on every request. This is acceptable for the current beta scale but must
  receive latency/query-count measurement before catalogue growth, not an
  unmeasured caching rewrite.
- No custom domain/email E2E, independent external beta E2E, timed restore
  rehearsal or enforceable branch protection has been proven.

### Production ordering conclusion

Monitoring a page that can make contradictory trust claims is the wrong first
release. The defensible order is:

1. public correctness and accessibility hotfix;
2. typed ingestion outcomes, bounded market windows and truthful source health;
3. independent health monitoring and baseline browser hardening;
4. UI/admin design-system consolidation and responsive evidence;
5. filing/financial coverage expansion with explicit source provenance;
6. owner-operated domain, email, restore and real-user launch gates.

## Homepage date-ledger research — 15 August 2026

### Product intent

The current root experience still makes the user choose between card browsing
and a separate calendar. That is backwards for the dominant first question:
“What is happening in IPOs today, and what happens next?” The homepage should
answer that immediately and use company exploration as a secondary workflow.

### Existing implementation

- `src/components/IpoBoard.tsx:70-100` defaults `PublicView` to `board`, so the
  card grid—not the date workflow—owns the first viewport.
- `src/components/IpoBoard.tsx:260-292` exposes Board, Dates, All IPOs and IPO
  Pipeline as peer tabs. The date experience therefore remains hidden until a
  user discovers and selects it.
- `src/components/IpoBoard.tsx:382-462` renders the card board first and the
  `CalendarView` only as the final view branch.
- `src/components/IpoBoard.tsx:1595-1780` already provides the correct data
  primitives: India-market day keys, event sorting, today-first grouping,
  Mainboard/SME filtering, per-IPO calendar links and verified/unverified row
  details. The homepage change should reuse these contracts rather than create
  another date interpretation.
- `src/app/globals.css:534-542` already defines the green Today group treatment,
  but the current agenda uses large catalogue cards rather than a scannable
  market table.

Current data supports the required row without a schema change: company,
Mainboard/SME, verification state, event type/date, price band, lot/minimum,
issue size, GMP freshness/confidence, demand, registrar and detail/source links
are already present on `BoardIpo` or derived by existing helpers.

### Current market patterns reviewed

- IPO Watch leads with the live market state and a “week ahead” grouped by day.
  It is excellent for answering what opens/closes next, but the weekly list is
  too sparse for a decision surface: https://www.ipowatch.co/
- GMP IPO Watch provides the familiar dense table—IPO, price band, bidding
  period, listing date, GMP and action—with status/type filters. It scans well,
  but does not organize the main table around lifecycle dates:
  https://www.gmpipowatch.in/ipo-list/all
- ForgeUp puts subscription, GMP, allotment status/date, listing date and docs
  into one table. This covers the right jobs but becomes visually overloaded:
  https://forgeup.in/ipo/
- IPORise uses a simpler calendar table with Mainboard/SME segmentation, while
  allotment checking is a separate control: https://www.iporise.com/calendar
- Upstox prioritizes open/upcoming status, price range, issue size and apply
  state in mobile-friendly cards. It is action-oriented but not source- or
  verification-oriented: https://upstox.com/ipo/current-ipo/

### Design conclusion

The IPOBharosa homepage should combine IPO Watch's date-first hierarchy with a
compact financial table, while retaining IPOBharosa's differentiation: visible
verification, source transparency and honest GMP labelling.

```text
Today: 15 Aug · 0 milestones · 4 open IPOs
[Today] [Next 7 days] [All dates]     [All | Mainboard | SME]

TODAY — green date band
No milestone today; markets are closed. 4 IPOs remain open.

MON 17 AUG — 8 milestones
Event       IPO / evidence       Price + lot      GMP       Demand      Action
Closes      Credent · SME        ₹179–189         —         11.2x       Details
Allotment   Behari · Mainboard   ₹271–285         ₹79       81.6x       Check
Listing     Dhoot · Mainboard    ₹829–871         ₹259      0.2x        Details
```

Today is always present, including a calm empty state when there is no
milestone. Upcoming sections follow chronologically. A green group tint marks
the actual market day; event pills retain distinct meanings: open/green,
close/amber, allotment/violet-orange and listing/blue. This avoids using green
for every semantic state while still making “today” unmistakable.

Desktop uses a semantic table. Mobile turns each table row into a compact
stacked record under the same date band—no horizontal scroll. The full month
calendar and subscription controls remain available as a secondary Calendar
view, not the homepage itself.

### Implemented contract

- The root now defaults to a dedicated `dates` view while Explore, All IPOs,
  Calendar and IPO Pipeline remain one click away.
- `dateLedgerGroups` owns the Today-always-present and seven-day/all-upcoming
  grouping contract; it reuses the same lifecycle event records as the ICS and
  month calendar.
- Desktop renders a semantic six-column table. At mobile widths the same table
  elements become labelled stacked records, preserving content without page
  overflow.
- Each row exposes type, verification, price/lot/minimum, honest GMP freshness,
  demand and a source/detail action. Allotment events use a known registrar's
  public status portal when available and never fabricate an allotment result.
- The implementation adds no schema, ingestion, auth or source-policy change.
- Local validation passed 268 tests, lint, TypeScript and the optimized Next.js
  build. Real-data responsive validation must run on Vercel Preview because the
  sandboxed local web process cannot reach the hosted database.
# Compact agenda and SME GMP coverage — 17 Aug 2026

- The responsive agenda switched every row into a vertically stacked card below 840px. Repeated full-width sections and a full-width CTA made a single IPO consume most of a tablet screen.
- A compact three-column information grid preserves event, company, price/minimum, GMP, demand and actions while reducing repeated labels and whitespace. Phones below 600px still get a readable two-column layout.
- The existing three GMP adapters have uneven SME coverage. Live checks found IPO Watch reports Skytech, while Credent and Technocrats have current quotes on InvestorGain; ENS, Fascinate and Pramodini currently show no active quote there.
- InvestorGain exposes the live report as structured JSON. The adapter can fetch the report once per five minutes, match known shortened company names, and treat `--` as unavailable rather than manufacturing a ₹0 quote.
- GMP remains unofficial. A fourth source improves coverage and cross-source comparison; it does not change the verification status of official IPO terms.
# Scrollable IPO rows — 17 Aug 2026

- Owner feedback rejects responsive cards: mobile and tablet should preserve the same table-row mental model as desktop.
- The lowest-complexity accessible solution is a real semantic table inside an explicit horizontal scroll container; no duplicate mobile markup is required.
- IPO/company is the most important identity column, so it moves first and remains sticky while price, GMP, demand and actions scroll horizontally.
- Dense mobile row typography and fixed minimum column widths retain all information without turning rows back into tall cards.
# Financial layout coverage research (2026-08-17)

## Production evidence

- Production run `31999764973` attempted ten unprocessed filing documents: one queued, seven parsed as no complete summary, and two were blocked with HTTP 403/406.
- Repeating the two blocked downloads with an explicit browser-compatible User-Agent and `Accept: application/pdf` downloaded valid PDFs. The documents were not unavailable; the worker request contract was incomplete.
- The seven readable skipped filings use several legitimate SEBI-style presentations:
  - compact `SUMMARY OF RESTATED FINANCIAL INFORMATION` tables (Optimystix, Lalithaa);
  - `SUMMARY OF FINANCIAL INFORMATION` tables derived from restated statements (Aegeus, Fusion, Poojaa);
  - multi-page restated statement sections whose title is on the preceding page (Alpine, Silverstorm, Manipal, MV).
- Annual columns appear as `March 31, 2025`, `31st March, 2025`, `FY 2025`, and `Fiscal 2024`. Some pages include an interim column before the annual columns.
- Some statements contain mixed per-column scope: recent years Consolidated and the oldest comparative Standalone. Treating the entire page as one scope would be materially wrong.
- Compact summaries expose safe crore-normalizable metrics: Revenue/Total Revenue/Total Income, PAT, Net Worth, Total Assets, Total Borrowings and EBITDA. EPS is per-share currency and must not enter the existing crore-normalized pipeline.

## Existing architecture

- `pdf-extractor/extract.py` downloads a filing, validates PDF/ZIP bytes, hashes the exact PDF and sends page text to `pdf-extractor/targeted.py`.
- `targeted.py` is intentionally fail-closed: it requires a financial statement/summary context, explicit unit, explicit annual period and explicit scope before emitting a row.
- `src/app/api/admin/submit-extracted-financials/route.ts` validates the evidence boundary; `src/lib/financials/workflow.ts` normalizes values and routes every candidate to `REVIEW_REQUIRED`.
- Publication remains an authenticated admin decision. The change must increase candidate coverage without weakening that gate.

## Safety constraints

- Never infer a missing unit, reporting period, scope or audit status.
- Drop interim columns; emit only annual periods.
- Preserve mixed Standalone/Consolidated scope per fiscal column.
- Do not extract EPS until the persisted model supports per-share units.
- A conflict with an existing published figure stays in `REVIEW_REQUIRED`; no extraction directly publishes.

## Real-filing verification after implementation

The pinned production extractor (`pypdf==5.9.0`) was run against the exact nine
previously skipped/blocked filings. All nine now produce complete, reviewable
rows: 75 candidates total across Revenue, PAT, EBITDA, Assets, Net Worth and
Borrowings.

| Filing | Complete candidates | Covered metrics |
| --- | ---: | --- |
| Alpine | 9 | Revenue, PAT, EBITDA |
| MV | 3 | Assets |
| Lalithaa | 12 | Revenue, PAT, Net Worth, Assets |
| Optimystix | 6 | PAT, Net Worth |
| Aegeus | 12 | Revenue, PAT, Net Worth, Borrowings |
| Fusion | 12 | Revenue, PAT, Net Worth, Borrowings |
| Manipal | 9 | Revenue, PAT, Assets |
| Poojaa | 6 | PAT, Assets |
| Silverstorm | 6 | Revenue, PAT |

The extractor still does not invent missing metrics. It emits only rows with a
source page, explicit unit, annual fiscal period, restated audit status and a
defensible scope. Multi-page metadata is carried for at most two pages and all
old metric values and period columns are stripped before carry-forward, which
prevents silent fiscal-year remapping. EPS remains intentionally excluded.

## Manipal official-mirror closure

- The captured Manipal company DRHP URL consistently returns HTTP 403 to the
  production worker. The official NSE DRHP archive accepts the request but did
  not complete within the bounded 180-second read timeout; increasing that
  timeout would let one upstream filing monopolize the scheduled worker.
- Kotak Investment Banking, an official BRLM, hosts the final Manipal RHP. A
  live pinned-parser run downloaded all 717 pages and found the explicit
  consolidated restated summaries on PDF pages 100–101.
- The final RHP produced nine high-confidence candidates: Assets, Revenue and
  PAT for FY2024, FY2025 and FY2026. The fallback is therefore persisted as an
  `RHP`, not mislabeled as the older `DRHP`.
- A mirror submission carries the exact empty captured document ID. The API
  validates that it belongs to the same IPO and retires it only after the
  mirror evidence and review candidates are persisted. A failed mirror remains
  retryable and no public value is auto-published.
