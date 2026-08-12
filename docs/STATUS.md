# IPOBharosa delivery status

Last verified: 12 August 2026

This is the short, shareable view. Detailed evidence and decisions live in
[`EXECPLAN.md`](EXECPLAN.md).

## Safe release flow

    main (Production)
      ↓ create one small branch
    Pull request
      ↓ lint + 121 tests + build + clean migration test
    Vercel Preview + isolated ipobharosa_dev database
      ↓ backend smoke + phone/tablet/desktop UI verification + evidence
    Human approval
      ↓ merge reviewed commit only
    Vercel Production + read-only smoke + monitoring

There is no blind merge and no shared Preview/Production database. A permanent
`develop` branch is unnecessary because every pull request gets its own Dev
deployment while using the same isolated Development data store.

## What is working

- Public Board, IPO detail, Compare, Calendar, Search, sitemap, and legal pages.
- Discovery plus GMP/subscription ingestion logic and deterministic Dev seed data.
- Multi-source GMP median, confidence, staleness, and source-health behavior.
- Google authentication has been exercised; automated tests currently total 121.
- Manual financial entry and human review scaffolding exists.
- An isolated Development database now exists for pull-request Previews.
- Pull-request CI, migration smoke checks, Preview smoke script, and evidence template are included in the release-foundation PR.
- Release-foundation PR #1 is open and green on an isolated Preview; it has not been merged to Production.

## What is partial or unhealthy

- Scheduled ingestion exists but the latest two Production cycles timed out with HTTP 504. It must be split into bounded, restartable work.
- Financial verification is scaffolding, not an automated pipeline: the in-app extractor returns no data; the new local Python parser is experimental and leaves uncertain context unresolved; no new financial records are published; and the public UI still reads the legacy table.
- Email code exists, but a real watchlist-to-reminder delivery has not been demonstrated; Production currently has zero watchlist items.
- The design-system HTML exists as a reference artifact, but the live components, responsive behavior, transitions, and state patterns have not been migrated to reusable code.
- Production schema matches the application, but migration history is incomplete. The new baseline migration must be verified and marked applied in Production before later migrations run.

## What is not started

- Custom `ipobharosa.com` domain and verified Resend DNS.
- Error monitoring, alerting, backup/restore rehearsal, and a real beta-user journey.
- Official RHP/DRHP download and real file checksum storage.
- Native PDF extraction, OCR fallback, semantic financial validation, corrections/versioning, and public reads from approved financial records.
- Live IPO application/provider integration. Codifi/ODIN response and sandbox approval are still required; real PAN, demat, and UPI data must not be stored before that.

## Small pull-request queue

| Order | Pull request | Outcome required before merge |
|---:|---|---|
| 1 | `release-foundation` | CI green; clean migrations; Preview uses Dev DB; frontend/backend smoke evidence |
| 2 | `ingestion-batching` | Three consecutive Dev cycles finish below timeout; retries create no duplicates |
| 3 | `design-tokens-components` | Tokens and reusable components cover responsive, focus, motion, loading, empty, error, and disabled states |
| 4 | `board-ui-refresh` | Board/Search/Compare/Calendar visually verified at 360, 390, 768, 1024, and 1440 px |
| 5 | `detail-ui-refresh` | IPO detail and source evidence work across all viewports and states |
| 6 | `financial-document-ingestion` | Official source validation, file download, actual SHA-256, page count, and idempotency |
| 7 | `financial-native-extraction` | Page-evidenced table candidates; nothing auto-published |
| 8 | `financial-ocr-fallback` | Scanned pages route low-confidence results to review |
| 9 | `financial-review-hardening` | Units, fiscal period, scope, audit status, duplicates, corrections, and audit trail verified |
| 10 | `financial-public-read` | Public UI reads only human-approved `FinancialPublished` data |
| 11 | `domain-email-observability` | Domain/DNS, Google + email auth, real reminder E2E, alerts, and recovery rehearsal |
| 12 | `ipo-application-mock` | Dummy-data-only consent and status UX behind a feature flag |
| 13 | `ipo-provider-spike` | Sandbox adapter only after provider and compliance confirmation |

The current priority is 1 → 2 → 3/4/5 → 6–10 → 11. Provider work remains
separate so it cannot delay making the core product trustworthy and operable.
