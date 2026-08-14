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
