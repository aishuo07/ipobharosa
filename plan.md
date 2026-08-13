# Implementation Plan: Mainboard + SME board and calendar sync

Status: approved by the product owner on 2026-08-13; historical NSE coverage extension explicitly requested and in progress.

## Approach

Deliver the user-visible filtering and calendar subscription without changing the database contract, then diagnose and repair the actual SME publication gap with the existing authoritative-source rules. This avoids shipping an empty decorative SME tab or weakening the trust gate.

## Changes

### 1. Shared board filter contract

**Files:** `src/lib/board-filter.ts`, `src/lib/board-filter.test.ts`

- Add the allowlisted filter type `ALL | MAINBOARD | SME`.
- Add reusable predicate, label, and strict query parser.
- Test all values and invalid query input.

### 2. Board experience

**Files:** `src/components/IpoBoard.tsx`, `src/app/globals.css`, component tests

- Add a prominent `All IPOs / Mainboard / SME` segmented selector to Board and Calendar views.
- Default to `All IPOs`.
- Scope lifecycle counts, search results, cards, compare state, and calendar events to the selected board.
- Show real counts beside each option.
- Make the zero-SME state operationally honest: no verified SME IPOs currently available, rather than suggesting the feature is broken.
- Preserve the current responsive design and keyboard/ARIA behavior.

### 3. Board-specific calendar subscriptions

**Files:** `src/lib/calendar.ts`, `src/app/api/calendar/route.ts`, `src/lib/calendar.test.ts`, route tests

- Support `/api/calendar?board=MAINBOARD` and `/api/calendar?board=SME`; keep `/api/calendar` as all IPOs.
- Preserve the existing `?ipo=<slug>` single-IPO feed.
- Make Google Calendar subscription URLs board-aware.
- Use distinct calendar names for all/Mainboard/SME feeds.
- Keep every event's detail-page URL so users can return to IPOBharosa for sources and current data.
- Add short UI copy explaining this is a live subscription and Google controls refresh timing.

### 4. SME publication-gap diagnostic and fix

**Files:** existing discovery/official-source modules and focused tests only where the diagnostic proves a defect

- Run a no-write classification of current SME candidates.
- Report counts by `AUTO_PUBLISH`, `RETRY`, and `EXCEPTION`, with concrete reasons.
- If a deterministic parser/matching defect blocks valid SME candidates, add a focused regression test and fix it.
- Do not bulk publish weak/unverified candidates and do not weaken official-source requirements.
- If valid SMEs become `AUTO_PUBLISH`, keep the write behind the existing publication flag and separately report the exact candidates before any Production write.

### 5. Official NSE historical coverage extension

**Files:** `src/lib/discovery/official/nse.ts`, normalization/consensus modules, focused adapter tests

- Fetch and cache NSE's public past-issues catalogue only after current/upcoming lookup misses.
- Match exact normalized issuer names first; permit only one unambiguous multi-token prefix match for shortened source names.
- Request the archived issue through NSE's official detail endpoint using its symbol, series and `type=Past`.
- Normalize historical `Lot Size` and final `Prospectus` labels into the existing material evidence contract.
- Keep the same field-level consensus; archive coverage changes evidence availability, not publication safety.
- Re-run the 37-SME no-write diagnostic and report exact results before any write.

### 6. Verification and delivery

- Run lint, unit/integration tests, build, and migration smoke.
- Verify 390px, 768px, and desktop layouts without overflow.
- Verify All/Mainboard/SME filters and Google Calendar URLs in the preview.
- Create a PR and deploy the reviewed build; do not apply the pending Production Prisma migrations in this change.

### 7. Existing-draft automatic revalidation

- Add a bounded ingestion stage that rechecks up to eight oldest Draft/Quarantined candidates per run.
- Rotate every checked row by `updatedAt` so the queue progresses without a manual ID list or unbounded request.
- Keep publication behind `OFFICIAL_IPO_AUTO_PUBLISH_ENABLED`; conflicts remain quarantined and missing evidence remains unpublished.
- Persist every available official comparison and create the correct official document/audit entry only when publication succeeds.

## Todo

- [DONE] Add and test shared board-filter contract.
- [DONE] Add All/Mainboard/SME selector with accurate counts.
- [DONE] Scope status tabs, search, compare, and calendar UI by board.
- [DONE] Add board-aware ICS API and Google Calendar subscription URLs.
- [DONE] Add calendar subscription explanation and return-to-site links.
- [DONE] Run SME no-write diagnostic and document exact blockers.
- [DONE] Fix only demonstrated deterministic SME ingestion defects (none demonstrated; no unsafe matching change made).
- [DONE] Add official NSE historical catalogue fallback and focused tests.
- [DONE] Run a public-name coverage check for all previously diagnosed SME candidates; 9/37 now have complete official NSE evidence. A full decision rerun still requires the candidate facts stored in Production and remains no-write.
- [DONE] Run full automated verification after the coverage extension (191 tests, lint, build, schema validation; existing CI migration smoke remains green).
- [DONE] Verify preview interactions and desktop overflow; responsive CSS breakpoints remain covered by the existing mobile layout rules.
- [DONE] Push branch and open PR #29.
- [DONE] Add and test bounded automatic revalidation for already-tracked drafts.
- [DONE] Apply the two explicitly approved Production migrations and verify migration status.
- [DONE] Resume and complete the persisted ingestion cycle; capture exact publication outcomes.
- [DONE] Verify a fresh cycle persists the official filing catalogue (100 stored, 29 linked).
- [DONE] Fix the demonstrated IST date and SME minimum-application normalization defects with regression coverage.

## Rollback

- Revert the feature commit; no database migration or destructive data mutation is part of this plan.
- Existing unfiltered `/api/calendar` and single-IPO feeds remain compatible throughout.

## Explicitly out of scope

- Publishing unverified SME candidates.
- Bypassing source access controls.
- Applying the two currently pending Production Prisma migrations.
- Native Google OAuth calendar-write access; hosted ICS subscription achieves continuous sync without requesting broad calendar permissions.
