# Research: Mainboard + SME coverage and calendar sync

## Live evidence

- `https://ipobharosa.vercel.app/` currently serializes 17 published IPOs.
- All 17 carry `board: "MAINBOARD"`; Production currently has zero published SME IPOs.
- The public calendar feed currently contains 68 events (four lifecycle dates across the published set).
- `/api/calendar?board=SME` currently returns the same 68 events because the route ignores board query parameters.

## Data architecture

- `prisma/schema.prisma` already models `IpoBoard.MAINBOARD` and `IpoBoard.SME`; no schema migration is required for board filtering.
- `src/lib/board-data.ts:getBoardIpos()` returns every `PUBLISHED` IPO without a board restriction. Therefore the UI is not silently suppressing SME records.
- `src/lib/discovery/ipowatch-list.ts` explicitly parses both Mainboard and SME tables and its regression test verifies it does not truncate either table.
- `src/lib/discovery/official/nse.ts` maps NSE series `SME` to the normalized SME board and `EQ` to Mainboard.
- The missing SME cards are therefore a publication/verification coverage issue: no SME candidate has reached `PUBLISHED` in Production. A visual toggle alone would produce an empty SME tab.
- The authoritative pipeline must diagnose SME candidates separately, preserve its `AUTO_PUBLISH / RETRY / EXCEPTION` rules, and never manufacture price, lot, dates, or board values.

## Current board UX

- `src/components/IpoBoard.tsx` has view tabs (`Board`, `IPO Pipeline`, `Calendar`) and lifecycle tabs (`Open`, `Upcoming`, `Awaiting Allotment`, `Listed`).
- There is no exchange-board selector. Search and lifecycle counts operate across the full `ipos` prop.
- Cards already show a `Mainboard` or `SME` tag, so a board selector can reuse existing vocabulary and styling.
- The right hierarchy is: view -> board (`All / Mainboard / SME`) -> lifecycle status. Search should respect the selected board but continue spanning lifecycle states.

## Current calendar UX

- `src/lib/calendar.ts` already produces standards-compliant `.ics` events for open, close, allotment, and listing dates. Each event links to the IPOBharosa detail page.
- `src/app/api/calendar/route.ts` already supports the complete feed and a single-IPO `?ipo=<slug>` feed.
- `googleCalendarSubscriptionUrl()` already constructs Google Calendar's subscription URL, but always points to the unfiltered all-IPO feed.
- Calendar buttons exist both on each IPO detail page and in the calendar view, but the capability is not explained and cannot be scoped by board.
- A subscription is preferable to one-time import: Google Calendar periodically refreshes the hosted feed. We must clearly say refresh timing is controlled by Google and is not instant.

## Required design

```text
Board / Calendar
  -> All IPOs (default)
  -> Mainboard
  -> SME

Calendar subscription
  -> All dates feed
  -> Mainboard-only feed
  -> SME-only feed
  -> Per-IPO feed (already supported)
  -> Every event links back to /ipo/<slug>
```

## Safety and rollout

- No schema change is required for the UI/calendar work.
- Board query parsing must be allowlisted; invalid values should return `400` instead of silently producing a misleading feed.
- Existing `/api/calendar` and `?ipo=` contracts must remain backward compatible.
- SME ingestion changes must first run as a no-write diagnostic against current candidates. Automatic publication remains subject to the existing official-field consensus rules and feature flag.
- The current two pending additive Production Prisma migrations are a separate deployment concern and must not be applied without fresh explicit approval.

## SME Production diagnostic (2026-08-13, no writes)

- 37 unpublished SME candidates were evaluated against the public NSE catalogue.
- `AUTO_PUBLISH`: 0; `RETRY`: 36; `EXCEPTION`: 1.
- All 36 retries are absent from NSE's narrow current/upcoming catalogue window. This is a historical-coverage limitation, not a front-end filter bug.
- `Skytech Infinite Platform` is the one current NSE SME issue. Its stored lot size and open/close dates conflict with NSE, so the existing safety contract correctly routed it to exception rather than publishing stale facts.
- The current NSE catalogue contains seven issues: six Mainboard and one SME. No deterministic parser or normalized-name defect was demonstrated by this run, so no ingestion matching rule should be weakened in this change.
- The durable next data task is an official NSE historical/archive adapter or a reviewed correction path for authoritative-source conflicts. It must be planned separately because it changes publication policy and source precedence.
