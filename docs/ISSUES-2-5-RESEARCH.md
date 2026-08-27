# Issues 2–5 research

## Current architecture

The scheduled GitHub workflow calls one Vercel route, `src/app/api/cron/ingest/route.ts`. That route currently performs status reconciliation, reminders, discovery, source setup, every GMP fetch, every GMP write, every subscription fetch, health updates, and alerting in one request. `src/lib/ingestion/run-cycle.ts` loops through every eligible IPO sequentially. With 40+ tracked IPOs, the work exceeds Vercel's 60-second function limit and GitHub receives HTTP 504.

The existing `IngestionRun.summary` JSON field can hold a durable stage, cursor, counters, and failure evidence without adding another database migration. `IngestionLock` already gives each short invocation exclusive ownership. GMP database writes and the cursor update must share one database transaction so a retry cannot write a batch twice.

The public application is a Next.js App Router application. `src/components/IpoBoard.tsx` currently owns Board, Search, Compare, Calendar, card, and detail-panel behavior in one large client component. `src/app/ipo/[slug]/page.tsx` separately composes the same detail content for SEO routes. Shared styling is concentrated in `src/app/globals.css`, but many layout choices are inline and component states do not have a named primitive layer.

## Implementation boundaries

Issue #2 will retain the existing route and lock, but one request will execute one bounded stage or batch. GitHub Actions will call the route repeatedly until the response says the cycle is complete. An unfinished `IngestionRun` is resumed by its persisted stage and cursor. Failed calls preserve the same cursor and record the failed stage and error.

Issue #3 will introduce code-level tokens and reusable primitives without changing Board data semantics. Issues #4 and #5 will consume those primitives in separate pull requests so visual changes remain reviewable and rollbackable.

## Risks

The largest ingestion risk is advancing a cursor separately from writes. The implementation must use a single transaction for a batch's writes and checkpoint update. Discovery and reminders already use idempotent database behavior and remain isolated in the prepare stage. Production schema must not change for Issue #2.

The largest UI risk is a large visual rewrite hiding behavior regressions. Existing search, status tabs, compare limit, calendar, watchlist calls, and evidence labels must remain functional, and Preview must be checked at the five agreed viewport widths.
